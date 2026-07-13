import { Request, Response } from 'express';
import { ReplayService } from '../application/replay/ReplayService';

export class ReplayController {
  constructor(private readonly replayService: ReplayService) {}

  /**
   * POST /internal/projection/replay
   * Triggers the projection replay process.
   */
  public triggerReplay = async (req: any, res: Response) => {
    try {
      const user = req.user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }

      const { reset, aggregateId, aggregateType, startDate, endDate, replayDlq } = req.body;

      const progress = await this.replayService.triggerReplay({
        aggregateId,
        aggregateType,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        reset: reset === true,
        replayDlq: replayDlq === true
      });

      return res.json({
        message: 'Replay process successfully triggered.',
        progress
      });
    } catch (err: any) {
      console.error('[ReplayController.triggerReplay] Error:', err.message);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  };

  /**
   * POST /internal/projection/replay/pause
   */
  public pauseReplay = async (req: any, res: Response) => {
    try {
      const user = req.user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }

      const progress = this.replayService.pauseReplay();
      return res.json({ message: 'Replay paused.', progress });
    } catch (err: any) {
      console.error('[ReplayController.pauseReplay] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * POST /internal/projection/replay/resume
   */
  public resumeReplay = async (req: any, res: Response) => {
    try {
      const user = req.user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }

      const progress = this.replayService.resumeReplay();
      return res.json({ message: 'Replay resumed.', progress });
    } catch (err: any) {
      console.error('[ReplayController.resumeReplay] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * POST /internal/projection/replay/cancel
   */
  public cancelReplay = async (req: any, res: Response) => {
    try {
      const user = req.user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }

      const progress = this.replayService.cancelReplay();
      return res.json({ message: 'Replay cancelled.', progress });
    } catch (err: any) {
      console.error('[ReplayController.cancelReplay] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * GET /internal/projection/replay/status
   */
  public getReplayStatus = async (req: any, res: Response) => {
    try {
      const user = req.user;
      if (user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' });
      }

      const progress = this.replayService.getReplayStatus();
      return res.json(progress);
    } catch (err: any) {
      console.error('[ReplayController.getReplayStatus] Error:', err.message);
      return res.status(500).json({ error: 'Internal server error' });
    }
  };
}
