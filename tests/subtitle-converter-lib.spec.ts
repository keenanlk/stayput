import { test, expect } from '@playwright/test';
import { convertSubtitles } from '../src/lib/subtitle-convert';
import { parseSubtitles } from '../src/lib/captions';

const SRT = '1\n00:00:01,000 --> 00:00:03,500\nWelcome to the course.\n\n2\n00:00:04,000 --> 00:00:07,200\nToday we start with the basics.\n';
const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:03.500\nWelcome to the course.\n\n00:00:04.000 --> 00:00:07.200\nToday we start with the basics.\n';

test('SRT to VTT writes the header, full-stop milliseconds and no numbers', () => {
  const r = convertSubtitles(SRT, 'auto');
  expect(r.format).toBe('vtt');
  expect(r.text).toBe(VTT);
});

test('VTT to SRT numbers from 1 and uses commas, and the round trip keeps words and times', () => {
  const r = convertSubtitles(VTT, 'auto');
  expect(r.format).toBe('srt');
  expect(r.text).toBe(SRT);
  expect(parseSubtitles(convertSubtitles(r.text, 'vtt').text)).toEqual(parseSubtitles(SRT));
});

test('a VTT with cue settings, a NOTE, a cue name and no hours converts and drops the extras', () => {
  const vtt = 'WEBVTT\n\nNOTE checked\n\nintro\n00:02.000 --> 00:04.500 line:10% align:start\nGood evening, and welcome.\n\n00:05.000 --> 00:08.000\nTonight <i>we</i> look.\n';
  const r = convertSubtitles(vtt, 'srt');
  expect(r.text).toBe('1\n00:00:02,000 --> 00:00:04,500\nGood evening, and welcome.\n\n2\n00:00:05,000 --> 00:00:08,000\nTonight we look.\n');
});

test('a UTF-8 BOM is accepted and counts as WebVTT', () => {
  const r = convertSubtitles('﻿' + VTT, 'auto');
  expect(r.format).toBe('srt');
  expect(r.text).toBe(SRT);
});

test('accents and non-Latin text survive', () => {
  const srt = '1\n00:00:00,500 --> 00:00:02,000\nCafé crème, señor. 日本語\n';
  expect(convertSubtitles(srt, 'vtt').text).toBe('WEBVTT\n\n00:00:00.500 --> 00:00:02.000\nCafé crème, señor. 日本語\n');
});

test('plain text output has the words only', () => {
  expect(convertSubtitles(SRT, 'txt').text).toBe('Welcome to the course. Today we start with the basics.\n');
});

test('a file that is not a subtitle file is an InputError', () => {
  expect(() => convertSubtitles('Dear Ada,\nThis is a letter.\n', 'auto')).toThrowError(
    expect.objectContaining({ name: 'InputError' }),
  );
});
