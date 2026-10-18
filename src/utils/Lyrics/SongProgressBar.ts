export class SongProgressBar {
  private duration: number; // in milliseconds
  private position: number; // in milliseconds
  private destroyed: boolean = false;

  constructor() {
    this.duration = 0;
    this.position = 0;
  }

  Update(params: { duration: number; position: number }): void {
    if (this.destroyed) {
      console.warn("This progress bar has been destroyed and cannot be used");
      return;
    }

    // Both duration and position are expected to be in milliseconds
    this.duration = params.duration;
    this.position = Math.min(params.position, this.duration);
  }

  Destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
  }

  GetFormattedDuration(): string {
    return this.formatTime(this.duration);
  }

  GetFormattedPosition(): string {
    return this.formatTime(this.position);
  }

  GetProgressPercentage(): number {
    if (this.duration <= 0) return 0;
    return this.position / this.duration;
  }

  // Calculate position in milliseconds directly
  CalculatePositionFromClick(params: { sliderBar: HTMLElement; event: MouseEvent }): number {
    const { sliderBar, event } = params;

    if (this.duration <= 0) return 0;

    const rect = sliderBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));

    // Calculate position in milliseconds directly
    const positionMs = Math.floor(percentage * this.duration);

    return positionMs;
  }

  private formatTime(timeInMs: number): string {
    return FormatPlaybackTime(timeInMs);
  }
}

// Format milliseconds as M:SS
export function FormatPlaybackTime(timeInMs: number): string {
  if (Number.isNaN(timeInMs) || timeInMs < 0) {
    return "0:00";
  }

  // Convert milliseconds to seconds
  const totalSeconds = Math.floor(timeInMs / 1000);

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
