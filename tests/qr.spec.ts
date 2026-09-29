import { test, expect } from '@playwright/test';
import { alignmentPositions, capacity, emailPayload, encodeQr, vcardPayload, wifiPayload } from '../src/lib/qr';

// https://stayput.dev at level M, as this encoder wrote it and OpenCV's QR reader decoded it back.
const STAYPUT = [
    '1111111011100111101111111',
    '1000001001110100001000001',
    '1011101001011011001011101',
    '1011101011010111101011101',
    '1011101010011101101011101',
    '1000001010100000001000001',
    '1111111010101010101111111',
    '0000000011011000000000000',
    '1000101111110111011111001',
    '0101000100110011010011010',
    '0001011111101111100111100',
    '1010100101001101010000110',
    '1101111000011100111001111',
    '1011000010000111100010010',
    '0011111001000001010111100',
    '0001110101001011000110110',
    '1111001010110110111111100',
    '0000000011001001100010000',
    '1111111010011110101010000',
    '1000001000010100100011101',
    '1011101011001100111111101',
    '1011101000100110011100111',
    '1011101000100001101001010',
    '1000001001101010011111110',
    '1111111010010111011000111',
];

test('QR encoder matches a code a reader decodes', () => {
  const qr = encodeQr('https://stayput.dev', 'M');
  expect(qr.version).toBe(2);
  expect(qr.modules.map((r) => r.map((b) => (b ? 1 : 0)).join(''))).toEqual(STAYPUT);
});

test('QR byte capacities match the standard', () => {
  const table = (['L', 'M', 'Q', 'H'] as const).map((e) => [capacity(1, e), capacity(10, e), capacity(40, e)]);
  expect(table).toEqual([
    [17, 271, 2953],
    [14, 213, 2331],
    [11, 151, 1663],
    [7, 119, 1273],
  ]);
  expect(alignmentPositions(7)).toEqual([6, 22, 38]);
  expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
  expect(alignmentPositions(40)).toEqual([6, 30, 58, 86, 114, 142, 170]);
});

test('QR encoder picks the smallest version, writes version info, and refuses text that cannot fit', () => {
  expect(encodeQr('a'.repeat(17), 'L').version).toBe(1);
  expect(encodeQr('a'.repeat(18), 'L').version).toBe(2);
  const big = encodeQr('x'.repeat(2953), 'L');
  expect(big.version).toBe(40);
  expect(big.size).toBe(177);
  expect(() => encodeQr('x'.repeat(2954), 'L')).toThrow(/Too long/);
  // Multi-byte characters count as their UTF-8 bytes.
  expect(encodeQr('✓'.repeat(5), 'L').version).toBe(1);
  expect(encodeQr('✓'.repeat(6), 'L').version).toBe(2);
});

test('QR payloads for Wi-Fi, contacts and email are escaped', () => {
  expect(wifiPayload({ ssid: 'My;Net', password: 'p:a"ss', security: 'WPA', hidden: false })).toBe('WIFI:T:WPA;S:My\\;Net;P:p\\:a\\"ss;;');
  expect(wifiPayload({ ssid: 'Cafe', password: 'ignored', security: 'nopass', hidden: true })).toBe('WIFI:T:nopass;S:Cafe;H:true;;');
  const card = vcardPayload({ first: 'Ada', last: 'Lovelace', phone: '+44 20 7946 0000', email: 'ada@example.com', org: 'Analytical, Ltd', title: '', url: '' });
  expect(card.split('\r\n')).toEqual(['BEGIN:VCARD', 'VERSION:3.0', 'N:Lovelace;Ada;;;', 'FN:Ada Lovelace', 'ORG:Analytical\\, Ltd', 'TEL;TYPE=CELL:+44 20 7946 0000', 'EMAIL:ada@example.com', 'END:VCARD']);
  expect(emailPayload({ to: 'a@b.co', subject: 'Hi there', body: '' })).toBe('mailto:a@b.co?subject=Hi%20there');
});
