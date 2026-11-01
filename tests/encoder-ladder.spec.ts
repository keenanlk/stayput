import { test, expect } from '@playwright/test';
import { adoptPlan, retryNote, retryOf, withRecovery, MAX_RUNS, type Attempt, type RecoveryHooks } from '../src/lib/edit-recovery';
import { planVideoCodec } from '../src/lib/video-codec';
import { capAtRisk } from '../src/lib/recovery-hooks';

// The shared encoder ladder (STAA-482), run in Node with a stub VideoEncoder: the test encode at the real output size, the order of
// the retries, the cap of three runs, and the phone rule for a 4K source. The page-level behaviour is in video-encoder.spec.ts.
const g = globalThis as Record<string, unknown>;

type Fails = (config: VideoEncoderConfig) => boolean;
/** A VideoEncoder that says every config is supported, and then reports EncodingError for those `fails` picks. */
function stubEncoder(fails: Fails) {
  class Stub {
    static async isConfigSupported(config: VideoEncoderConfig) {
      return { supported: true, config };
    }
    state = 'unconfigured';
    private broken = false;
    private packets = 0;
    constructor(private init: { output: (c: unknown, m?: unknown) => void; error: (e: unknown) => void }) {}
    configure(config: VideoEncoderConfig) {
      this.state = 'configured';
      if (fails(config)) {
        this.broken = true;
        queueMicrotask(() => this.init.error(new DOMException('forced by the test', 'EncodingError')));
      }
    }
    encode() {
      if (!this.broken) this.packets++;
    }
    async flush() {
      if (this.broken) throw new DOMException('forced by the test', 'EncodingError');
      for (let i = 0; i < this.packets; i++) this.init.output({});
    }
    close() {
      this.state = 'closed';
    }
  }
  g.VideoEncoder = Stub;
  g.VideoFrame = class {
    close() {}
  };
  g.OffscreenCanvas = class {
    getContext() {
      return { fillRect() {}, set fillStyle(_: string) {} };
    }
  };
}

function setNavigator(userAgent: string, maxTouchPoints = 0, vendor = 'Google Inc.') {
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent, maxTouchPoints, vendor } });
}
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

const named = (name: string) => Object.assign(new Error(name), { name });
const hooks = (over: Partial<RecoveryHooks> = {}): RecoveryHooks => ({ wasHidden: () => false, forgetHidden: () => {}, whenVisible: async () => {}, reclaimed: () => false, ...over });

test.describe('the test encode at the real size', () => {
  test.afterEach(() => {
    delete g.VideoEncoder;
    delete g.VideoFrame;
    delete g.OffscreenCanvas;
  });

  test('isConfigSupported says yes but the encoder errors above 1920: 3840x2160 gets maxSide 1920, within 3 s', async () => {
    setNavigator(CHROME);
    stubEncoder((c) => c.width > 1920);
    const t0 = Date.now();
    const plan = await planVideoCodec({ width: 3840, height: 2160, bitrate: 20_000_000 });
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(plan).toMatchObject({ codec: 'avc', maxSide: 1920 });
    expect(plan.hardwareAcceleration).toBeUndefined();
  });

  test('an encoder that only works as prefer-software: the plan keeps the size and asks for the software encoder', async () => {
    setNavigator(CHROME);
    stubEncoder((c) => c.width > 2000 && c.hardwareAcceleration !== 'prefer-software');
    const plan = await planVideoCodec({ width: 2560, height: 1440, bitrate: 10_000_000 });
    expect(plan).toEqual({ codec: 'avc', hardwareAcceleration: 'prefer-software' });
  });

  test('on WebKit, real-time latency is tried at the same size before any smaller one', async () => {
    setNavigator(IPHONE, 5, 'Apple Computer, Inc.');
    stubEncoder((c) => c.width > 1500 && c.latencyMode !== 'realtime');
    const plan = await planVideoCodec({ width: 1600, height: 900, bitrate: 8_000_000 });
    expect(plan).toEqual({ codec: 'avc', latencyMode: 'realtime' });
  });

  test('a working encoder: the plain pick, no smaller size, no setting', async () => {
    setNavigator(CHROME);
    stubEncoder(() => false);
    // (A different size from the first test: probe results are cached per size for the page.)
    expect(await planVideoCodec({ width: 3200, height: 1800, bitrate: 20_000_000 })).toEqual({ codec: 'avc' });
  });

  test('a smaller size found by the probe is said in the note, with the size; settings alone are not', async () => {
    const a: Attempt = {};
    const k = adoptPlan(a, { maxSide: 1920, hardwareAcceleration: 'prefer-software' }, 3840);
    expect(k).toBe(0.5);
    expect(a).toMatchObject({ maxSide: 1920, retry: 'probed', capped: true, hardwareAcceleration: 'prefer-software' });
    expect(retryNote(retryOf(a), { width: 1920, height: 1080 })).toBe(' (made at 1080p because the full size failed on this device)');

    const b: Attempt = {};
    expect(adoptPlan(b, { hardwareAcceleration: 'prefer-software' }, 3840)).toBe(1);
    expect(retryOf(b)).toBeUndefined();
  });
});

test.describe('rung order and the cap on runs', () => {
  const softwareRung = () => ({ hardwareAcceleration: 'prefer-software' as const });
  const realtimeRung = () => ({ latencyMode: 'realtime' as const });

  test('Chromium: prefer-software at the same size, then smaller; never more than 3 runs', async () => {
    const seen: Attempt[] = [];
    await expect(
      withRecovery(
        async (a) => {
          seen.push({ ...a });
          throw named('OperationError');
        },
        () => 3840,
        hooks({ firstRung: softwareRung, vp9: () => true }),
      ),
    ).rejects.toMatchObject({ name: 'EncoderGaveUp' });
    expect(seen).toHaveLength(MAX_RUNS);
    expect(seen[1]).toMatchObject({ retry: 'software', hardwareAcceleration: 'prefer-software' });
    expect(seen[1]!.maxSide).toBeUndefined();
    expect(seen[2]).toMatchObject({ retry: 'smaller', maxSide: 1920, hardwareAcceleration: 'prefer-software' });
  });

  test('WebKit: real-time at the same size first', async () => {
    const seen: Attempt[] = [];
    await withRecovery(
      async (a) => {
        seen.push({ ...a });
        if (seen.length === 1) throw named('EncoderStall');
        return 1;
      },
      () => 1920,
      hooks({ firstRung: realtimeRung }),
    );
    expect(seen[1]).toMatchObject({ retry: 'again', latencyMode: 'realtime' });
    expect(seen[1]!.maxSide).toBeUndefined();
  });

  test('VP9 comes last, once, and only where the hook says so', async () => {
    const seen: Attempt[] = [];
    // A 640-wide picture has no smaller rung, so after the software try the last rung is VP9.
    await withRecovery(
      async (a) => {
        seen.push({ ...a });
        if (seen.length < 3) throw named('EncodingError');
        return 1;
      },
      () => 640,
      hooks({ firstRung: softwareRung, vp9: () => true }),
    );
    expect(seen.map((a) => a.retry)).toEqual([undefined, 'software', 'vp9']);
    expect(seen[2]).toMatchObject({ vp9: true });
    expect(seen[2]!.hardwareAcceleration).toBeUndefined();

    const without: (string | undefined)[] = [];
    await expect(
      withRecovery(
        async (a) => {
          without.push(a.retry);
          throw named('EncodingError');
        },
        () => 640,
        hooks({ vp9: () => false }),
      ),
    ).rejects.toMatchObject({ name: 'EncoderGaveUp' });
    expect(without).toEqual([undefined]);
  });

  test('a page hidden and resumed does not use up the three runs', async () => {
    let hidden = true;
    let calls = 0;
    const out = await withRecovery(
      async () => {
        calls++;
        if (calls === 1) throw named('EncodingError');
        if (calls === 2) throw named('EncodingError');
        return 'ok';
      },
      () => 3840,
      hooks({ wasHidden: () => (hidden ? ((hidden = false), true) : false), firstRung: softwareRung }),
    );
    expect(out).toBe('ok');
    expect(calls).toBe(3);
  });

  test('an encoder that is still failing ends as EncoderGaveUp (no bare EncodingError); other names pass through', async () => {
    for (const bare of ['EncodingError', 'OperationError', 'NotSupportedError']) {
      await expect(withRecovery(async () => Promise.reject(named(bare)), () => 640, hooks())).rejects.toMatchObject({ name: 'EncoderGaveUp' });
    }
    // A codec the browser took back gets the name codec-guard.ts gives it.
    await expect(withRecovery(async () => Promise.reject(named('InvalidStateError')), () => 640, hooks())).rejects.toMatchObject({ name: 'CodecReclaimedError' });
    await expect(withRecovery(async () => Promise.reject(named('EncoderStall')), () => 640, hooks())).rejects.toMatchObject({ name: 'EncoderStall' });
    await expect(withRecovery(async () => Promise.reject(named('UnreadableFile')), () => 640, hooks())).rejects.toMatchObject({ name: 'UnreadableFile' });
  });

  test('a memory failure goes straight to a smaller picture, with no setting change and no VP9', async () => {
    const seen: (string | undefined)[] = [];
    await expect(
      withRecovery(
        async (a) => {
          seen.push(a.retry);
          throw named('OutOfMemoryError');
        },
        () => 3840,
        hooks({ firstRung: softwareRung, vp9: () => true }),
      ),
    ).rejects.toMatchObject({ name: 'OutOfMemoryError' });
    expect(seen).toEqual([undefined, 'smaller']);
  });
});

test.describe('phones with a 4K source', () => {
  const store = new Map<string, string>();
  test.beforeEach(() => {
    store.clear();
    g.sessionStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  });
  test.afterEach(() => {
    delete g.sessionStorage;
  });

  test('a desktop with no failure history stays at full size', () => {
    setNavigator(CHROME);
    const a: Attempt = {};
    capAtRisk(a, 3840);
    expect(a).toEqual({});
  });

  test('a phone with a 4K source starts at 1080p and the note says so; a 1080p source is left alone', () => {
    setNavigator(IPHONE, 5, 'Apple Computer, Inc.');
    const small: Attempt = {};
    capAtRisk(small, 1920);
    expect(small).toEqual({});

    const a: Attempt = {};
    capAtRisk(a, 3840);
    expect(a).toMatchObject({ maxSide: 1920, retry: 'atrisk' });
    adoptPlan(a, {}, 3840);
    expect(retryNote(retryOf(a), { width: 1920, height: 1080 })).toContain('made at 1080p because 4K is heavy for this device');
  });

  test('"Try full size" turns the at-risk start off for the rest of the tab', async () => {
    setNavigator(IPHONE, 5, 'Apple Computer, Inc.');
    capAtRisk({}, 3840);
    expect(store.get('stayput:risk-size')).toBe('1920');
    const { forgetWorkingSize, riskSize } = await import('../src/lib/working-size');
    forgetWorkingSize();
    expect(riskSize()).toBeUndefined();
    const a: Attempt = {};
    capAtRisk(a, 3840);
    expect(a).toEqual({});
  });

  test('a size remembered from a failure wins over the at-risk start', () => {
    setNavigator(IPHONE, 5, 'Apple Computer, Inc.');
    const a: Attempt = { maxSide: 1280, retry: 'remembered', remembered: true };
    capAtRisk(a, 3840);
    expect(a.maxSide).toBe(1280);
  });

  test('a phone that reports 3 GB or less starts a 4K source at 720p; 4 GB, or no report (Safari), at 1080p', () => {
    const withMemory = (deviceMemory?: number) => {
      setNavigator(IPHONE, 5, 'Apple Computer, Inc.');
      Object.assign(navigator, { deviceMemory });
    };
    for (const [gb, side] of [[3, 1280], [2, 1280], [4, 1920], [undefined, 1920]] as const) {
      withMemory(gb);
      const a: Attempt = {};
      capAtRisk(a, 3840);
      expect(a, `deviceMemory ${gb}`).toMatchObject({ maxSide: side, retry: 'atrisk' });
      expect(store.get('stayput:risk-size')).toBe(String(side));
    }
    withMemory(3);
    const a: Attempt = {};
    capAtRisk(a, 3840);
    adoptPlan(a, {}, 3840);
    expect(retryNote(retryOf(a), { width: 1280, height: 720 })).toContain('made at 720p because 4K is heavy for this device; use Try full size to keep 4K');
  });

  test('after a lost run the caption redraw starts any source over 1280 at 1280, until Try full size; other callers are not asked', async () => {
    setNavigator(IPHONE, 5, 'Apple Computer, Inc.');
    const { noteLostRun, forgetWorkingSize, lostRun } = await import('../src/lib/working-size');
    const hd: Attempt = {};
    capAtRisk(hd, 1920, true);
    expect(hd).toEqual({});
    noteLostRun();
    const other: Attempt = {};
    capAtRisk(other, 1920);
    expect(other).toEqual({});
    const small: Attempt = {};
    capAtRisk(small, 1280, true);
    expect(small).toEqual({});
    capAtRisk(hd, 1920, true);
    expect(hd).toMatchObject({ maxSide: 1280, retry: 'lost' });
    adoptPlan(hd, {}, 1920);
    expect(retryNote(retryOf(hd), { width: 1280, height: 720 })).toContain('made at 720p because the browser closed this page during the last run, most likely out of memory; use Try full size to keep the original size');
    forgetWorkingSize();
    expect(lostRun()).toBe(false);
    const after: Attempt = {};
    capAtRisk(after, 1920, true);
    expect(after).toEqual({});
  });
});
