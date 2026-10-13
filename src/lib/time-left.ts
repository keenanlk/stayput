/**
 * "About 6 min left" for a long job that reports its progress as a fraction.
 *
 * The estimate comes from how fast the last stretch of real work went, so it copes with slow phones, throttled chips and
 * 60 fps videos that a fixed constant would get wrong. It is only local state: nothing is stored or sent.
 */

/** Seconds of real work to watch before the first estimate is shown. */
const WARM_UP = 2.5;
/** Only the last stretch of work is used, so a slow start or a thermal slowdown stops counting after a while. */
const WINDOW = 30;
/** A new estimate within this share of the time left is ignored, so the figure counts down instead of jittering. */
const HOLD = 0.1;
/** The figure only goes up for a slowdown worth showing: a rise smaller than this (seconds) is rounding, not news. */
const MIN_RISE = 10;

export function formatTimeLeft(seconds: number): string {
  if (seconds < 60) return `${Math.max(10, Math.round(seconds / 10) * 10)} s left`;
  if (seconds < 180) {
    const half = Math.round(seconds / 30) * 30;
    return half % 60 === 0 ? `${half / 60} min left` : `${Math.floor(half / 60)} min 30 s left`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} min left`;
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes % 60) / 5) * 5;
  return m === 0 || m === 60 ? `${m === 60 ? h + 1 : h} h left` : `${h} h ${m} min left`;
}

export class TimeLeft {
  private samples: { t: number; f: number }[] = [];
  /** When the job is expected to finish, in the clock's seconds. */
  private eta: number | undefined;

  constructor(private readonly clock: () => number = () => performance.now() / 1000) {}

  /** Report `fraction` (0 to 1) of the work done. Returns "about 6 min left", or undefined while it is still measuring. */
  update(fraction: number): string | undefined {
    const now = this.clock();
    // The first report is the baseline: it leaves out whatever start-up came before the first frame.
    if (this.samples.length === 0 || fraction < this.samples[this.samples.length - 1]!.f) this.samples = [{ t: now, f: fraction }];
    else this.samples.push({ t: now, f: fraction });
    while (this.samples.length > 2 && now - this.samples[1]!.t >= WINDOW) this.samples.shift();
    const first = this.samples[0]!;
    if (now - first.t < WARM_UP || fraction <= first.f) return undefined;
    const rate = (fraction - first.f) / (now - first.t);
    const fresh = now + (1 - fraction) / rate;
    if (this.eta === undefined) this.eta = fresh;
    else {
      const left = Math.max(1, this.eta - now);
      const change = fresh - this.eta;
      // Coming down only needs to clear the hold. Going up must also be a real slowdown, so a 14 s estimate that turns into
      // 16 s doesn't flip "10 s left" to "20 s left" on the rounding alone.
      if (change < -HOLD * left || change > Math.max(HOLD * left, MIN_RISE)) this.eta = fresh;
    }
    return `about ${formatTimeLeft(Math.max(0, this.eta - now))}`;
  }
}
