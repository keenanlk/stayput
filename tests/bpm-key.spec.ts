// @webkit-project
import { test, expect } from '@playwright/test';
import MusicTempo from 'music-tempo';
import { alsoReadAs, analyseKey, analyseTempo, camelot, confidenceLabel, CSV_HEADER, foldTempo, halve, keyName, NAMES, relativeOf, resultsCsv, type Mode } from '../src/lib/bpm-key';
import { fft } from '../src/lib/fft';
import { chords, clickTrack } from './music-synth';

test('foldTempo moves a tempo by whole octaves into 70 to 180', () => {
  expect(foldTempo(70)).toBe(70);
  expect(foldTempo(69)).toBe(138);
  expect(foldTempo(180)).toBe(90);
  expect(foldTempo(200)).toBe(100);
  expect(foldTempo(35)).toBe(70);
  expect(foldTempo(128)).toBe(128);
  expect(foldTempo(360)).toBe(90);
});

test('camelot gives the standard code for all 24 keys', () => {
  const major = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'F'];
  const majorCodes = ['8B', '9B', '10B', '11B', '12B', '1B', '2B', '3B', '4B', '5B', '6B', '7B'];
  const minor = ['A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'F', 'C', 'G', 'D'];
  const minorCodes = ['8A', '9A', '10A', '11A', '12A', '1A', '2A', '3A', '4A', '5A', '6A', '7A'];
  major.forEach((n, i) => expect(camelot(NAMES.indexOf(n), 'major'), `${n} major`).toBe(majorCodes[i]));
  minor.forEach((n, i) => expect(camelot(NAMES.indexOf(n), 'minor'), `${n} minor`).toBe(minorCodes[i]));
});

test('a relative key has the same number and the other letter', () => {
  for (let t = 0; t < 12; t++) {
    for (const mode of ['major', 'minor'] as const) {
      const rel = relativeOf(t, mode);
      expect(rel.mode).not.toBe(mode);
      expect(parseInt(camelot(rel.tonic, rel.mode))).toBe(parseInt(camelot(t, mode)));
    }
  }
  expect(keyName(relativeOf(0, 'major').tonic, relativeOf(0, 'major').mode)).toBe('A minor');
});

test('fft puts a sine at its bin and keeps the energy', () => {
  const n = 1024;
  const re = new Float32Array(n);
  const im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin((2 * Math.PI * 37 * i) / n);
  const timeEnergy = re.reduce((a, v) => a + v * v, 0);
  fft(re, im);
  const mag = Array.from(re, (r, i) => Math.hypot(r, im[i]!));
  const peak = mag.indexOf(Math.max(...mag.slice(0, n / 2)));
  expect(peak).toBe(37);
  for (let i = 0; i < n / 2; i++) if (i !== 37) expect(mag[i]!).toBeLessThan(mag[37]! * 0.01);
  const freqEnergy = mag.reduce((a, v) => a + v * v, 0) / n;
  expect(Math.abs(freqEnergy - timeEnergy) / timeEnergy).toBeLessThan(1e-3);
});

test('analyseKey finds all 24 keys from synthesised chords, and the tuning', () => {
  for (const mode of ['major', 'minor'] as Mode[]) {
    for (let t = 0; t < 12; t++) {
      const key = analyseKey(chords(t, mode, 20));
      expect(key, keyName(t, mode)).not.toBeNull();
      expect({ tonic: key!.tonic, mode: key!.mode }, keyName(t, mode)).toEqual({ tonic: t, mode });
      expect(key!.camelot).toBe(camelot(t, mode));
    }
  }
  const sharp = analyseKey(chords(0, 'major', 20, 22050, 30))!;
  expect({ tonic: sharp.tonic, mode: sharp.mode }).toEqual({ tonic: 0, mode: 'major' });
  expect(sharp.tuningCents).toBe(30);
});

test('analyseTempo reads click tracks, to the beat or an octave away', () => {
  for (const bpm of [80, 100, 120, 150]) {
    const result = analyseTempo(clickTrack(bpm, 60));
    expect(result, `${bpm} BPM`).not.toBeNull();
    const near = (x: number) => Math.abs(result!.raw - x) / x < 0.02;
    expect(near(bpm) || near(bpm * 2) || near(bpm / 2), `${bpm} gave ${result!.raw}`).toBe(true);
    if (bpm !== 80) expect(Math.abs(result!.bpm - bpm) / bpm, `${bpm} folded to ${result!.bpm}`).toBeLessThan(0.02);
    else expect([80, 160].some((x) => Math.abs(result!.bpm - x) / x < 0.02)).toBe(true);
  }
});

test('silence and very short input do not throw', () => {
  expect(analyseKey(new Float32Array(22050 * 20))).toBeNull();
  expect(analyseKey(new Float32Array(Math.round(0.3 * 22050)))).toBeNull();
  expect(halve(new Float32Array(10)).length).toBe(5);
});

test('the half and double are shown only when plausible', () => {
  expect(alsoReadAs(98)).toEqual([49, 196]);
  expect(alsoReadAs(70)).toBeNull();
  expect(alsoReadAs(130)).toBeNull();
  expect(alsoReadAs(110)).toEqual([55, 220]);
});

test('resultsCsv has the header, quotes names and neutralises formulas', () => {
  expect(CSV_HEADER).toBe('file,duration_seconds,bpm,bpm_raw,key,camelot,relative_key,relative_camelot,key_confidence');
  const key = { tonic: 9, mode: 'minor' as Mode, r: 0.8, second: { tonic: 0, mode: 'major' as Mode, r: 0.7 }, camelot: '8A', tuningCents: 0 };
  const csv = resultsCsv([
    { name: '=SUM(1,1).mp3', duration: 200, tempo: { raw: 196.2, bpm: 98.1 }, key },
    { name: 'a, "b".mp3', duration: 12.34, tempo: null, key: { ...key, r: 0.5 } },
  ]);
  const lines = csv.trim().split('\n');
  expect(lines[0]).toBe(CSV_HEADER);
  expect(lines[1]).toBe(`"'=SUM(1,1).mp3",200.0,98.1,196.2,A minor,8A,C major,8B,likely`);
  expect(lines[2]).toBe(`"a, ""b"".mp3",12.3,,,A minor,8A,C major,8B,unsure`);
});

test('confidenceLabel switches at 0.75', () => {
  expect(confidenceLabel(0.75)).toBe('likely');
  expect(confidenceLabel(0.749)).toBe('unsure');
});

test('music-tempo still assumes 44.1 kHz', () => {
  const tempo = Number(new MusicTempo(clickTrack(120, 60)).tempo);
  expect([120, 240, 60].some((x) => Math.abs(tempo - x) / x < 0.02), `got ${tempo}`).toBe(true);
});
