export class UndoRedoManager<T> {
  private history: T[] = [];
  private index: number = -1;
  private maxHistory: number = 100;

  constructor(maxHistory = 100) {
    this.maxHistory = maxHistory;
  }

  push(state: T) {
    // If we're adding a new state, remove any forward history
    this.history = this.history.slice(0, this.index + 1);
    this.history.push(state);
    
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    } else {
      this.index++;
    }
  }

  undo(): T | null {
    if (this.index > 0) {
      this.index--;
      return this.history[this.index];
    }
    return null;
  }

  redo(): T | null {
    if (this.index < this.history.length - 1) {
      this.index++;
      return this.history[this.index];
    }
    return null;
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.history.length - 1;
  }

  getCurrentState(): T | null {
    return this.index >= 0 ? this.history[this.index] : null;
  }

  clear() {
    this.history = [];
    this.index = -1;
  }

  getHistoryLength(): number {
    return this.history.length;
  }

  getIndex(): number {
    return this.index;
  }
}
