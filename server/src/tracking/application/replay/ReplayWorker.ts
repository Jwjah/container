import { DomainEvent } from '../../domain/events/DomainEvent';
import { ProjectionEventDispatcher } from '../dispatcher/ProjectionEventDispatcher';
import { ReplayProgressTracker } from './ReplayProgressTracker';

/**
 * ReplayWorker — handles async execution of the replay cycle.
 *
 * RFC-007 Phase 7F Specification
 */
export class ReplayWorker {
  private cancelSignal = false;
  private pauseSignal = false;

  constructor(
    private readonly dispatcher: ProjectionEventDispatcher,
    private readonly tracker: ReplayProgressTracker
  ) {}

  public pause(): void {
    this.pauseSignal = true;
    this.tracker.pause();
  }

  public resume(): void {
    this.pauseSignal = false;
    this.tracker.resume();
  }

  public cancel(): void {
    this.cancelSignal = true;
    this.tracker.cancel();
  }

  /**
   * Runs the replay loop over the provided array of events.
   * Processes events asynchronously in small chunks to prevent blocking the event loop.
   */
  public async executeReplay(events: DomainEvent[]): Promise<void> {
    this.cancelSignal = false;
    this.pauseSignal = false;
    
    this.tracker.start(events.length);
    if (events.length === 0) {
      this.tracker.complete();
      return;
    }

    // Run execution in chunks of 20 events to avoid blocking Express
    const chunkSize = 20;
    let index = 0;

    const processNextChunk = async (): Promise<void> => {
      if (this.cancelSignal) {
        return;
      }

      // Handle pause loop
      if (this.pauseSignal) {
        await new Promise(r => setTimeout(r, 100)); // sleep 100ms
        return processNextChunk();
      }

      const limit = Math.min(index + chunkSize, events.length);
      for (; index < limit; index++) {
        if (this.cancelSignal) return;

        const event = events[index];
        try {
          // Re-dispatch using the same dispatcher and handlers
          await this.dispatcher.dispatch(event);
          this.tracker.incrementProcessed();
        } catch (err: any) {
          console.error(`[ReplayWorker] Error replaying event ${event.eventId}:`, err.message);
          this.tracker.incrementErrors();
          // We continue processing other events during replay (best effort rebuild)
          this.tracker.incrementProcessed();
        }
      }

      if (index < events.length && !this.cancelSignal) {
        // Yield execution back to Node.js event loop
        await new Promise(resolve => setImmediate(resolve));
        return processNextChunk();
      } else if (!this.cancelSignal) {
        this.tracker.complete();
      }
    };

    // Begin asynchronous loop
    await processNextChunk();
  }
}
