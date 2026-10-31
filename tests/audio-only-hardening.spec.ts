// @webkit-project
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  openSync,
  readSync,
  closeSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stageError } from "../src/lib/bare-error";

// The audio-only path of Remove noise, Volume booster and the tools that decode a whole recording: every failure ends
// under a name a person can act on (never Error, TypeError or RangeError), long and odd files run, and a long recording
// on a phone is warned about before Run. The fixtures are made here with ffmpeg; none is committed.
const fx = (n: string) =>
  fileURLToPath(new URL(`./fixtures/static/${n}`, import.meta.url));
const PHONE =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const BARE = ["Error", "TypeError", "RangeError", "SyntaxError"];
type Ev = { n: string; d: Record<string, string> };
const events = (page: Page): Promise<Ev[]> =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("__ev") || "[]"));

const dir = mkdtempSync(join(tmpdir(), "stayput-h17-"));
const f = (name: string) => join(dir, name);
const ffmpeg = (...args: string[]) =>
  execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "pipe" });
const tone = (rate: number) => [
  "-f",
  "lavfi",
  "-i",
  `sine=frequency=440:sample_rate=${rate}`,
  "-t",
  "3",
];
const seconds = (file: string) =>
  Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      file,
    ])
      .toString()
      .trim(),
  );

test.beforeAll(() => {
  // About 115 MB: two hours of mono 8 kHz, 16-bit. Longer than a phone is told to try, small enough for CI.
  ffmpeg(
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=color=pink:amplitude=0.05:sample_rate=8000",
    "-t",
    "7200",
    "-ac",
    "1",
    "-c:a",
    "pcm_s16le",
    f("long-2h.wav"),
  );
  ffmpeg(...tone(8000), "-ac", "1", "-c:a", "pcm_s16le", f("mono8k.wav"));
  ffmpeg(...tone(22050), "-ac", "1", "-c:a", "libmp3lame", f("mono22k.mp3"));
  ffmpeg(...tone(48000), "-c:a", "pcm_s24le", f("s24.wav"));
  ffmpeg(...tone(48000), "-c:a", "pcm_f32le", f("f32.wav"));
  ffmpeg(...tone(48000), "-rf64", "always", "-c:a", "pcm_s16le", f("rf64.wav"));
  const song = readHead(fx("song.mp3"), 4000);
  writeFileSync(f("truncated.mp3"), song);
  copyFileSync(fx("song.ogg"), f("really-ogg.mp3"));
  writeFileSync(f("empty.mp3"), "");
});

function readHead(path: string, n: number): Buffer {
  const fd = openSync(path, "r");
  const out = Buffer.alloc(Math.min(n, statSync(path).size));
  readSync(fd, out, 0, out.length, 0);
  closeSync(fd);
  return out;
}

async function open(page: Page, url: string) {
  await page.addInitScript(() =>
    Object.defineProperty(Navigator.prototype, "webdriver", {
      get: () => false,
    }),
  );
  await page.route("https://stats.keenankaufman.com/**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.umami={track:(n,d)=>{const k='__ev';const a=JSON.parse(sessionStorage.getItem(k)||'[]');a.push({n,d});sessionStorage.setItem(k,JSON.stringify(a));}};`,
    }),
  );
  return async () => {
    await page.goto(url);
    await expect(page.locator("#tool")).toHaveAttribute("data-ready", "true");
  };
}

/** The class the first run recorded, or 'ok'. */
async function outcome(page: Page, timeout = 120_000): Promise<string> {
  await expect
    .poll(
      async () => (await events(page)).filter((e) => e.n === "tool_run").length,
      { timeout },
    )
    .toBe(1);
  const run = (await events(page)).find((e) => e.n === "tool_run")!.d;
  return run.outcome === "ok" ? "ok" : run.error_class!;
}

test.describe("stageError", () => {
  test("a memory RangeError is OutOfMemoryError with audio words, and keeps its cause", () => {
    const e = stageError(
      "AudioDecodeFailed",
      new RangeError("Array buffer allocation failed"),
    ) as Error & { links?: { href: string }[] };
    expect(e.name).toBe("OutOfMemoryError");
    expect(e.cause).toBeInstanceOf(RangeError);
    expect(e.message).toContain("recording");
    expect(e.links?.map((l) => l.href)).toEqual([
      "/tools/audio-splitter",
      "/tools/trim-audio",
    ]);
    expect(
      stageError(
        "AudioEncodeFailed",
        new RangeError("Invalid array buffer length"),
      ).name,
    ).toBe("OutOfMemoryError");
    expect(
      stageError("AudioEncodeFailed", new Error("std::bad_alloc")).name,
    ).toBe("OutOfMemoryError");
  });

  test("a bare error takes the step name and the step message", () => {
    for (const bare of [
      new Error("x"),
      new TypeError("Failed to fetch"),
      new SyntaxError("y"),
      "text",
    ]) {
      const e = stageError("AudioEncodeFailed", bare, {
        message:
          "Saving the MP3 file failed. Try again, or choose another format.",
      });
      expect(e.name).toBe("AudioEncodeFailed");
      expect(e.message).toBe(
        "Saving the MP3 file failed. Try again, or choose another format.",
      );
    }
    expect(
      stageError("VolumeReadFailed", new Error("Something went wrong."))
        .message,
    ).toContain("couldn't read the sound");
  });

  test("named errors pass through untouched", () => {
    for (const name of [
      "EncodingError",
      "NotReadableError",
      "NoSoundTrack",
      "AudioDecodeError",
      "OutOfMemoryError",
      "AudioDecodeFailed",
    ]) {
      const named = Object.assign(new Error("mine"), { name });
      expect(stageError("VolumeEncodeFailed", named)).toBe(named);
    }
  });
});

test.describe("broken files end under a name", () => {
  test.setTimeout(180_000);
  for (const [label, file] of [
    ["a truncated MP3", "truncated.mp3"],
    ["an OGG named .mp3", "really-ogg.mp3"],
    ["an RF64 WAV", "rf64.wav"],
  ] as const) {
    for (const url of ["/tools/volume-booster", "/tools/remove-noise"]) {
      test(`${url}: ${label}`, async ({ page }) => {
        const go = await open(page, url);
        await go();
        await page.locator("#file-input").setInputFiles(f(file));
        await page.locator("#run").click();
        const result = await outcome(page);
        // A decoder may read these (a few seconds of the truncated MP3, the OGG by its content); what is never allowed is a bare name.
        expect(BARE).not.toContain(result);
        if (result !== "ok")
          await expect(page.locator("#error")).toHaveClass(/is-active/);
      });
    }
  }

  test("a 0-byte file is refused at the drop, and never starts a run", async ({
    page,
  }) => {
    const go = await open(page, "/tools/volume-booster");
    await go();
    await page.locator("#file-input").setInputFiles(f("empty.mp3"));
    await expect(page.locator("#error")).toContainText("empty (0 bytes)");
    expect(
      await events(page).then((e) => e.filter((x) => x.n === "tool_run")),
    ).toEqual([]);
  });

  test("an RF64 WAV the browser cannot read says so in the large-file words", async ({
    page,
  }) => {
    const go = await open(page, "/tools/volume-booster");
    // Make the decoder refuse it, as the browsers that cannot read RF64 do.
    await page.addInitScript(() => {
      const real = BaseAudioContext.prototype.decodeAudioData;
      BaseAudioContext.prototype.decodeAudioData = function () {
        return Promise.reject(
          new DOMException("Unable to decode audio data", "EncodingError"),
        );
      } as typeof real;
    });
    await go();
    await page.locator("#file-input").setInputFiles(f("rf64.wav"));
    await page.locator("#run").click();
    await expect(page.locator("#error")).toContainText("RF64", {
      timeout: 60_000,
    });
    expect(await outcome(page)).toBe("AudioDecodeError");
  });
});

test.describe("mono and odd sample rates keep their length", () => {
  test.setTimeout(240_000);
  for (const url of ["/tools/remove-noise", "/tools/volume-booster"]) {
    for (const file of ["mono8k.wav", "mono22k.mp3", "s24.wav", "f32.wav"]) {
      test(`${url}: ${file}`, async ({ page }) => {
        const go = await open(page, url);
        await go();
        const download = page.waitForEvent("download");
        await page.locator("#file-input").setInputFiles(f(file));
        await page.locator("#run").click();
        const path = await (await download).path();
        expect(await outcome(page)).toBe("ok");
        // ~0.1 s allowed for AAC and MP3 priming.
        expect(Math.abs(seconds(path) - 3)).toBeLessThan(0.15);
      });
    }
  }
});

test.describe("a two-hour recording", () => {
  test.setTimeout(900_000);
  for (const url of ["/tools/volume-booster", "/normalize-audio"]) {
    test(`${url} runs without a RangeError`, async ({ page }, info) => {
      const go = await open(page, url);
      await go();
      await page.locator("#file-input").setInputFiles(f("long-2h.wav"));
      await page.locator("#run").click();
      const result = await outcome(page, 840_000);
      expect(BARE).not.toContain(result);
      // Chromium holds it; WebKit in CI may name the memory it ran out of.
      if (info.project.name === "chromium") expect(result).toBe("ok");
      else expect(["ok", "OutOfMemoryError"]).toContain(result);
    });
  }

  test.describe("on a phone", () => {
    test.use({ userAgent: PHONE });
    for (const url of [
      "/tools/volume-booster",
      "/tools/remove-noise",
      "/tools/audio-splitter",
    ]) {
      test(`${url} warns before Run, and Run stays allowed`, async ({
        page,
      }) => {
        const go = await open(page, url);
        await go();
        await page.locator("#file-input").setInputFiles(f("long-2h.wav"));
        const hint = page.locator("#run-hint");
        await expect(hint).toContainText("an hour or longer", {
          timeout: 60_000,
        });
        if (url.endsWith("audio-splitter"))
          await expect(hint).toContainText("try it on a computer");
        else
          await expect(hint.locator("a")).toHaveAttribute(
            "href",
            "/tools/audio-splitter",
          );
        await expect(page.locator("#run")).toBeEnabled();
        // Nothing about it is recorded.
        expect(
          (await events(page)).filter(
            (e) => e.n.startsWith("tool_"),
          ),
        ).toEqual([]);
      });
    }

    test("a recording over the phone limit is decoded in stretches, not handed whole to the browser", async ({ page }, info) => {
      test.setTimeout(900_000);
      // 3 hours of mono 8 kHz, 16-bit: about 173 MB, over the 150 MB a phone decodes whole.
      ffmpeg("-f", "lavfi", "-i", "anoisesrc=color=pink:amplitude=0.05:sample_rate=8000", "-t", "10800", "-ac", "1", "-c:a", "pcm_s16le", f("long-3h.wav"));
      const go = await open(page, "/tools/volume-booster");
      await page.addInitScript(() => {
        const w = window as unknown as { __whole: number };
        w.__whole = 0;
        const real = BaseAudioContext.prototype.decodeAudioData;
        BaseAudioContext.prototype.decodeAudioData = function (this: BaseAudioContext, data: ArrayBuffer, ...rest: never[]) {
          if (data.byteLength > 100_000_000) w.__whole++;
          return (real as (...a: unknown[]) => Promise<AudioBuffer>).call(this, data, ...rest);
        } as typeof real;
      });
      await go();
      await page.locator("#file-input").setInputFiles(f("long-3h.wav"));
      await page.locator("#run").click();
      const result = await outcome(page, 840_000);
      expect(BARE).not.toContain(result);
      if (info.project.name === "chromium") expect(result).toBe("ok");
      expect(await page.evaluate(() => (window as unknown as { __whole: number }).__whole)).toBe(0);
    });

    test("a short recording gets no warning", async ({ page }) => {
      const go = await open(page, "/tools/volume-booster");
      await go();
      await page.locator("#file-input").setInputFiles(f("mono8k.wav"));
      await expect(page.locator("#run")).toBeEnabled();
      await page.waitForTimeout(1500);
      await expect(page.locator("#run-hint")).not.toContainText("an hour");
    });
  });
});

test.describe("forced failures", () => {
  test.setTimeout(180_000);

  test("the MP3 encoder failing to load is named, not a bare TypeError", async ({
    page,
  }) => {
    const go = await open(page, "/remove-background-noise-from-audio");
    await page.route("**/*mp3.wasm*", (route) => route.abort());
    await go();
    await page.locator("#format").selectOption("mp3");
    await page.locator("#file-input").setInputFiles(fx("song.mp3"));
    await page.locator("#run").click();
    await expect(page.locator("#error")).toHaveClass(/is-active/, {
      timeout: 120_000,
    });
    const result = await outcome(page);
    expect(BARE).not.toContain(result);
    expect(["AudioEncoderLoadError", "AudioEncodeFailed"]).toContain(result);
    await expect(page.locator("#error")).not.toContainText("Failed to fetch");
  });

  test("an allocation that fails while saving is OutOfMemoryError, with a link to the Audio splitter", async ({
    page,
  }) => {
    const go = await open(page, "/tools/volume-booster");
    await page.addInitScript(() => {
      window.ArrayBuffer = new Proxy(window.ArrayBuffer, {
        construct(target, args: [number], newTarget) {
          if (
            (window as unknown as { __arm?: boolean }).__arm &&
            args[0] > 100_000
          )
            throw new RangeError("Array buffer allocation failed");
          return Reflect.construct(target, args, newTarget);
        },
      });
    });
    await go();
    await page.locator("#format").selectOption("wav");
    await page.locator("#file-input").setInputFiles(fx("song.mp3"));
    await page.evaluate(
      () => ((window as unknown as { __arm: boolean }).__arm = true),
    );
    await page.locator("#run").click();
    await expect(page.locator("#error")).toHaveClass(/is-active/, {
      timeout: 120_000,
    });
    await expect(page.locator("#error")).toContainText(
      "ran out of memory working on this recording",
    );
    await expect(page.locator("#error a")).toHaveText([
      "Audio splitter",
      "Trim audio",
    ]);
    expect(await outcome(page)).toBe("OutOfMemoryError");
  });

  test.describe("on a phone", () => {
    test.use({ userAgent: PHONE });
    test("a screen that locks mid-run is named PageHiddenError", async ({
      page,
    }) => {
      const go = await open(page, "/tools/remove-noise");
      await page.addInitScript(() => {
        const setState = (v: string) => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => v,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        };
        window.Blob = new Proxy(window.Blob, {
          construct(target, args: [BlobPart[]?, BlobPropertyBag?], newTarget) {
            // The save fails with the page hidden, every time; the page comes back a moment later.
            if (
              args[1]?.type === "audio/mpeg" ||
              args[1]?.type === "audio/wav"
            ) {
              setState("hidden");
              setTimeout(() => setState("visible"), 300);
              throw new Error("boom");
            }
            return Reflect.construct(target, args, newTarget);
          },
        });
      });
      await go();
      await page.locator("#format").selectOption("wav");
      await page.locator("#file-input").setInputFiles(f("mono8k.wav"));
      await page.locator("#run").click();
      await expect(page.locator("#error")).toContainText("screen locked", {
        timeout: 120_000,
      });
      expect(await outcome(page)).toBe("PageHiddenError");
    });
  });
});

test.describe("the page", () => {
  test("/ogg-to-mp3 reads the input once, with no spare copy", async ({
    page,
  }) => {
    const go = await open(page, "/ogg-to-mp3");
    const size = statSync(fx("song.ogg")).size;
    await page.addInitScript((n) => {
      const w = window as unknown as { __reads: number; __copies: number };
      w.__reads = 0;
      w.__copies = 0;
      const arrayBuffer = Blob.prototype.arrayBuffer;
      Blob.prototype.arrayBuffer = function (this: Blob) {
        if (this.size === n) w.__reads++;
        return arrayBuffer.call(this);
      };
      const slice = ArrayBuffer.prototype.slice;
      ArrayBuffer.prototype.slice = function (
        this: ArrayBuffer,
        ...a: [number?, number?]
      ) {
        if (this.byteLength === n) w.__copies++;
        return slice.apply(this, a);
      };
    }, size);
    await go();
    await page.locator("#file-input").setInputFiles(fx("song.ogg"));
    await page.locator("#run").click();
    expect(await outcome(page)).toBe("ok");
    expect(
      await page.evaluate(
        () => (window as unknown as { __reads: number }).__reads,
      ),
    ).toBe(1);
    expect(
      await page.evaluate(
        () => (window as unknown as { __copies: number }).__copies,
      ),
    ).toBe(0);
  });

  test("the M4A choice is not offered where there is no AAC encoder", async ({
    page,
  }) => {
    await page.addInitScript(() =>
      Object.defineProperty(window, "AudioEncoder", {
        value: undefined,
        configurable: true,
      }),
    );
    for (const url of ["/tools/volume-booster", "/tools/remove-noise"]) {
      await page.goto(url);
      await expect(page.locator("#tool")).toHaveAttribute("data-ready", "true");
      await expect(page.locator('#format option[value="m4a"]')).toBeDisabled();
      await expect(page.locator('#format option[value="mp3"]')).toBeEnabled();
    }
  });
});
