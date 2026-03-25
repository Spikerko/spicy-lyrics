import { type Giveable, Maid } from "@spikerko/web-modules/Maid";

class IntervalManager implements Giveable {
  private maid: Maid;
  private callback: () => void;
  private duration: number; // Duration in milliseconds
  private lastTimestamp: number | null;
  private animationFrameId: number | null;
  private intervalId: ReturnType<typeof setInterval> | null;
  public Running: boolean;
  public Destroyed: boolean;

  constructor(duration: number, callback: () => void) {
    if (Number.isNaN(duration)) {
      throw new Error("Duration cannot be NaN.");
    }

    this.maid = new Maid();
    this.callback = callback;
    this.duration = duration === Infinity ? 0 : duration * 1000; // Convert seconds to milliseconds or set to 0 for immediate execution
    this.lastTimestamp = null;
    this.animationFrameId = null;
    this.intervalId = null;
    this.Running = false;
    this.Destroyed = false;
  }

  // Starts the requestAnimationFrame loop
  public Start() {
    if (this.Destroyed) {
      console.warn("Cannot start; IntervalManager has been destroyed.");
      return;
    }

    if (this.Running) {
      console.warn("Interval is already running.");
      return;
    }

    this.Running = true;
    this.lastTimestamp = null;

    if (this.duration > 0 && Number.isFinite(this.duration)) {
      this.intervalId = setInterval(() => {
        if (!this.Running || this.Destroyed) return;
        this.callback();
      }, this.duration);

      this.maid.Give(() => this.Stop());
      return;
    }

    const loop = (timestamp: number) => {
      if (!this.Running || this.Destroyed) return;

      if (this.lastTimestamp === null) {
        this.lastTimestamp = timestamp;
      }

      const elapsed = timestamp - this.lastTimestamp;

      if (this.duration === 0 || elapsed >= this.duration) {
        this.callback();
        this.lastTimestamp = this.duration === 0 ? null : timestamp; // Reset timestamp for immediate execution when duration is infinite
      }

      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);

    // Register cleanup with the Maid
    this.maid.Give(() => this.Stop());
  }

  // Stops the animation frame loop without destroying the manager
  public Stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.Running = false;
    this.lastTimestamp = null;
  }

  // Restarts the animation frame loop
  public Restart() {
    if (this.Destroyed) {
      console.warn("Cannot restart; IntervalManager has been destroyed.");
      return;
    }

    this.Stop();
    this.Start();
  }

  // Fully cleans up the manager and makes it unusable
  public Destroy() {
    if (this.Destroyed) {
      console.warn("IntervalManager is already destroyed.");
      return;
    }

    this.Stop();
    this.maid.CleanUp();
    this.Destroyed = true;
    this.Running = false;
  }
}

export { IntervalManager };
