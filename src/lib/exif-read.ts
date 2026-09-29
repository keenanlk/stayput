/**
 * Read every EXIF field in a TIFF block into labelled, human-readable rows
 * for the EXIF viewer. Parsing only: nothing here changes the file. The
 * lossless stripper and the short summary live in exif.ts.
 */

export type FieldGroup = 'Camera' | 'Shot' | 'Date and time' | 'Location' | 'Image' | 'Author and IDs' | 'Other';

export interface ExifField {
  group: FieldGroup;
  label: string;
  value: string;
  /** Identifies a person, a place, a device or a moment. Highlighted in the viewer. */
  sensitive?: boolean;
}

export interface ExifReport {
  fields: ExifField[];
  /** Decimal coordinates when the GPS block has a usable latitude and longitude. */
  gps?: { lat: number; lon: number; altitude?: number };
  /** An embedded preview image (IFD1); it can show the photo before it was cropped. */
  hasThumbnail: boolean;
}

type Value = number[] | string | Uint8Array;

interface TagDef {
  label: string;
  group: FieldGroup;
  sensitive?: boolean;
  format?: (v: Value) => string | undefined;
}

const ORIENTATION = ['', 'Normal', 'Mirrored', 'Rotated 180°', 'Flipped vertically', 'Mirrored, rotated 90° left', 'Rotated 90° right', 'Mirrored, rotated 90° right', 'Rotated 90° left'];
const EXPOSURE_PROGRAM = ['Not defined', 'Manual', 'Normal program', 'Aperture priority', 'Shutter priority', 'Creative', 'Action', 'Portrait', 'Landscape'];
const METERING = { 0: 'Unknown', 1: 'Average', 2: 'Center-weighted', 3: 'Spot', 4: 'Multi-spot', 5: 'Pattern', 6: 'Partial', 255: 'Other' } as Record<number, string>;
const LIGHT = { 0: 'Unknown', 1: 'Daylight', 2: 'Fluorescent', 3: 'Tungsten', 4: 'Flash', 9: 'Fine weather', 10: 'Cloudy', 11: 'Shade', 17: 'Standard light A', 255: 'Other' } as Record<number, string>;
const COLOR_SPACE = { 1: 'sRGB', 0xffff: 'Uncalibrated' } as Record<number, string>;
const SCENE = ['Standard', 'Landscape', 'Portrait', 'Night'];
const RES_UNIT = ['', 'None', 'inches', 'cm'];

const n0 = (v: Value) => (Array.isArray(v) ? v[0] : undefined);
const fmtNum = (x: number, digits = 2) => String(Number(x.toFixed(digits)));
const lookup = (table: readonly string[] | Record<number, string>) => (v: Value) => {
  const x = n0(v);
  if (x === undefined) return undefined;
  return (table as Record<number, string>)[x] ?? String(x);
};
const str = (v: Value) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map((x) => fmtNum(x, 4)).join(', ') : undefined);
/** EXIF versions are four ASCII digits stored as UNDEFINED: "0232" -> 2.32. */
const version = (v: Value) => {
  const s = v instanceof Uint8Array ? String.fromCharCode(...v.subarray(0, 4)) : typeof v === 'string' ? v : '';
  return /^\d{4}$/.test(s) ? `${Number(s.slice(0, 2))}.${s.slice(2)}` : undefined;
};

const exposureTime = (v: Value) => {
  const x = n0(v);
  if (!x) return undefined;
  return x >= 1 ? `${fmtNum(x, 1)} s` : `1/${Math.round(1 / x)} s`;
};

function flash(v: Value): string | undefined {
  const x = n0(v);
  if (x === undefined) return undefined;
  if ((x & 0x20) !== 0) return 'No flash function';
  return x & 1 ? 'Fired' : 'Did not fire';
}

/** Tags in IFD0 and the Exif sub-IFD. Unlisted tags are shown by number under Other. */
const TAGS: Record<number, TagDef> = {
  0x010f: { label: 'Make', group: 'Camera', sensitive: true },
  0x0110: { label: 'Model', group: 'Camera', sensitive: true },
  0x0131: { label: 'Software', group: 'Camera' },
  0x013c: { label: 'Host computer', group: 'Camera', sensitive: true },
  0xa433: { label: 'Lens make', group: 'Camera' },
  0xa434: { label: 'Lens model', group: 'Camera' },
  0xa432: { label: 'Lens specification', group: 'Camera', format: (v) => (Array.isArray(v) ? v.map((x) => fmtNum(x, 1)).join(' / ') : undefined) },
  0x0100: { label: 'Width', group: 'Image', format: (v) => (n0(v) !== undefined ? `${n0(v)} px` : undefined) },
  0x0101: { label: 'Height', group: 'Image', format: (v) => (n0(v) !== undefined ? `${n0(v)} px` : undefined) },
  0xa002: { label: 'Pixel width', group: 'Image', format: (v) => (n0(v) !== undefined ? `${n0(v)} px` : undefined) },
  0xa003: { label: 'Pixel height', group: 'Image', format: (v) => (n0(v) !== undefined ? `${n0(v)} px` : undefined) },
  0x0112: { label: 'Orientation', group: 'Image', format: lookup(ORIENTATION) },
  0x011a: { label: 'X resolution', group: 'Image', format: (v) => (n0(v) !== undefined ? fmtNum(n0(v)!) : undefined) },
  0x011b: { label: 'Y resolution', group: 'Image', format: (v) => (n0(v) !== undefined ? fmtNum(n0(v)!) : undefined) },
  0x0128: { label: 'Resolution unit', group: 'Image', format: lookup(RES_UNIT) },
  0xa001: { label: 'Color space', group: 'Image', format: lookup(COLOR_SPACE) },
  0x010e: { label: 'Description', group: 'Image', sensitive: true },
  0x9000: { label: 'EXIF version', group: 'Other', format: version },
  0xa000: { label: 'FlashPix version', group: 'Other', format: version },
  0x829a: { label: 'Exposure time', group: 'Shot', format: exposureTime },
  0x829d: { label: 'Aperture', group: 'Shot', format: (v) => (n0(v) ? `f/${fmtNum(n0(v)!, 1)}` : undefined) },
  0x8822: { label: 'Exposure program', group: 'Shot', format: lookup(EXPOSURE_PROGRAM) },
  0x8827: { label: 'ISO', group: 'Shot', format: (v) => (n0(v) !== undefined ? String(n0(v)) : undefined) },
  0x9204: { label: 'Exposure bias', group: 'Shot', format: (v) => (n0(v) !== undefined ? `${fmtNum(n0(v)!, 2)} EV` : undefined) },
  0x9207: { label: 'Metering mode', group: 'Shot', format: lookup(METERING) },
  0x9208: { label: 'Light source', group: 'Shot', format: lookup(LIGHT) },
  0x9209: { label: 'Flash', group: 'Shot', format: flash },
  0x920a: { label: 'Focal length', group: 'Shot', format: (v) => (n0(v) ? `${fmtNum(n0(v)!, 1)} mm` : undefined) },
  0xa405: { label: 'Focal length (35 mm equiv.)', group: 'Shot', format: (v) => (n0(v) ? `${n0(v)} mm` : undefined) },
  0xa402: { label: 'Exposure mode', group: 'Shot', format: lookup(['Auto', 'Manual', 'Auto bracket']) },
  0xa403: { label: 'White balance', group: 'Shot', format: lookup(['Auto', 'Manual']) },
  0xa406: { label: 'Scene type', group: 'Shot', format: lookup(SCENE) },
  0xa404: { label: 'Digital zoom', group: 'Shot', format: (v) => (n0(v) ? `${fmtNum(n0(v)!, 2)}x` : undefined) },
  0x9202: { label: 'Aperture value (APEX)', group: 'Shot', format: (v) => (n0(v) !== undefined ? fmtNum(n0(v)!) : undefined) },
  0x9201: { label: 'Shutter speed value (APEX)', group: 'Shot', format: (v) => (n0(v) !== undefined ? fmtNum(n0(v)!) : undefined) },
  0x9203: { label: 'Brightness (APEX)', group: 'Shot', format: (v) => (n0(v) !== undefined ? fmtNum(n0(v)!) : undefined) },
  0x0132: { label: 'Modified', group: 'Date and time', sensitive: true },
  0x9003: { label: 'Taken', group: 'Date and time', sensitive: true },
  0x9004: { label: 'Digitized', group: 'Date and time', sensitive: true },
  0x9010: { label: 'Time zone (modified)', group: 'Date and time', sensitive: true },
  0x9011: { label: 'Time zone (taken)', group: 'Date and time', sensitive: true },
  0x9012: { label: 'Time zone (digitized)', group: 'Date and time' },
  0x9290: { label: 'Subseconds (modified)', group: 'Date and time' },
  0x9291: { label: 'Subseconds (taken)', group: 'Date and time' },
  0x9292: { label: 'Subseconds (digitized)', group: 'Date and time' },
  0x013b: { label: 'Artist', group: 'Author and IDs', sensitive: true },
  0x8298: { label: 'Copyright', group: 'Author and IDs', sensitive: true },
  0xa430: { label: 'Camera owner', group: 'Author and IDs', sensitive: true },
  0xa431: { label: 'Camera serial number', group: 'Author and IDs', sensitive: true },
  0xa435: { label: 'Lens serial number', group: 'Author and IDs', sensitive: true },
  0xa420: { label: 'Unique image ID', group: 'Author and IDs', sensitive: true },
  0x9286: { label: 'User comment', group: 'Author and IDs', sensitive: true, format: userComment },
  0x927c: { label: 'Maker note', group: 'Other', format: (v) => `${v.length} bytes of manufacturer data` },
};

/** Structural tags that describe how pixels are stored; not worth a row. */
const SKIP = new Set([0x0102, 0x0103, 0x0106, 0x0111, 0x0115, 0x0116, 0x0117, 0x011c, 0x0153, 0x014a, 0x0201, 0x0202, 0x0213, 0x8769, 0x8825, 0xa005, 0x0211, 0x0212, 0x0214, 0x9101, 0x9102, 0xa300, 0xa301, 0xa302, 0xa20e, 0xa20f, 0xa210, 0xa217, 0xa401, 0xa407, 0xa408, 0xa409, 0xa40a, 0xa40c, 0x8830, 0x8832, 0x9214, 0xa460, 0xa461, 0xa462, 0x88b0]);

function userComment(v: Value): string | undefined {
  if (!(v instanceof Uint8Array) || v.length <= 8) return undefined;
  const code = String.fromCharCode(...v.subarray(0, 8)).replace(/\0/g, '');
  const body = v.subarray(8);
  const text = code === 'UNICODE' ? new TextDecoder('utf-16be').decode(body) : new TextDecoder().decode(body);
  return text.replace(/\0+/g, '').trim() || undefined;
}

const GPS_TAGS: Record<number, string> = {
  0x0006: 'Altitude',
  0x0007: 'GPS time (UTC)',
  0x000c: 'Speed unit',
  0x000d: 'Speed',
  0x0010: 'Direction reference',
  0x0011: 'Direction the camera faced',
  0x0012: 'Map datum',
  0x001d: 'GPS date',
  0x001f: 'Horizontal accuracy',
};

/** Parse a TIFF block (the bytes after "Exif\0\0", or a whole TIFF/DNG file). */
export function readExif(tiff: Uint8Array): ExifReport {
  const report: ExifReport = { fields: [], hasThumbnail: false };
  if (tiff.length < 8) return report;
  const le = tiff[0] === 0x49 && tiff[1] === 0x49;
  if (!le && !(tiff[0] === 0x4d && tiff[1] === 0x4d)) return report;
  const dv = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (o: number) => dv.getUint16(o, le);
  const u32 = (o: number) => dv.getUint32(o, le);
  if (u16(2) !== 42) return report;

  const SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

  /** Read an IFD entry's value; undefined when it points outside the block. */
  const value = (e: number): Value | undefined => {
    const type = u16(e + 2);
    const count = u32(e + 4);
    const size = SIZES[type];
    if (!size || count > 1_000_000) return undefined;
    const total = size * count;
    const start = total <= 4 ? e + 8 : u32(e + 8);
    if (start + total > tiff.length) return undefined;
    switch (type) {
      case 2:
        return new TextDecoder().decode(tiff.subarray(start, start + count)).replace(/\0+$/, '').trim();
      case 1:
      case 6:
      case 7:
        return tiff.subarray(start, start + count);
      default: {
        const out: number[] = [];
        for (let i = 0; i < Math.min(count, 64); i++) {
          const o = start + i * size;
          if (type === 3) out.push(u16(o));
          else if (type === 8) out.push(dv.getInt16(o, le));
          else if (type === 4) out.push(u32(o));
          else if (type === 9) out.push(dv.getInt32(o, le));
          else if (type === 5) out.push(u32(o + 4) ? u32(o) / u32(o + 4) : 0);
          else if (type === 10) out.push(dv.getInt32(o + 4, le) ? dv.getInt32(o, le) / dv.getInt32(o + 4, le) : 0);
          else if (type === 11) out.push(dv.getFloat32(o, le));
          else if (type === 12) out.push(dv.getFloat64(o, le));
        }
        return out;
      }
    }
  };

  const seen = new Set<number>();
  const labels = new Set<string>();
  const add = (f: ExifField) => {
    if (!f.value || labels.has(f.label)) return;
    labels.add(f.label);
    report.fields.push(f);
  };

  const readIfd = (offset: number, kind: 'main' | 'exif' | 'gps' | 'thumb'): number => {
    if (offset < 8 || offset + 2 > tiff.length || seen.has(offset)) return 0;
    seen.add(offset);
    const n = u16(offset);
    const gps: Record<number, Value> = {};
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > tiff.length) break;
      const tag = u16(e);
      if (kind === 'thumb') {
        if (tag === 0x0201 || tag === 0x0111) report.hasThumbnail = true;
        continue;
      }
      if (tag === 0x8769 || tag === 0xa005 || tag === 0x8825) {
        const ptr = u32(e + 8);
        if (tag === 0x8769) readIfd(ptr, 'exif');
        else if (tag === 0x8825) readIfd(ptr, 'gps');
        continue;
      }
      const v = value(e);
      if (v === undefined) continue;
      if (kind === 'gps') {
        gps[tag] = v;
        continue;
      }
      if (SKIP.has(tag)) continue;
      const def = TAGS[tag];
      if (def) {
        const text = def.format ? def.format(v) : str(v);
        if (text) add({ group: def.group, label: def.label, value: text, sensitive: def.sensitive });
      } else if (typeof v === 'string' || (Array.isArray(v) && v.length <= 4)) {
        add({ group: 'Other', label: `Tag 0x${tag.toString(16).padStart(4, '0')}`, value: str(v) ?? '' });
      }
    }
    if (kind === 'gps') addGps(gps);
    return offset + 2 + n * 12 + 4 <= tiff.length ? u32(offset + 2 + n * 12) : 0;
  };

  const addGps = (g: Record<number, Value>) => {
    const coord = (v: Value | undefined, ref: Value | undefined, neg: string) => {
      if (!Array.isArray(v) || v.length < 3) return undefined;
      const [d, m, s] = v as [number, number, number];
      const x = d + m / 60 + s / 3600;
      return typeof ref === 'string' && ref.toUpperCase().startsWith(neg) ? -x : x;
    };
    const lat = coord(g[2], g[1], 'S');
    const lon = coord(g[4], g[3], 'W');
    if (lat !== undefined && lon !== undefined && !(lat === 0 && lon === 0)) {
      report.gps = { lat, lon };
      add({ group: 'Location', label: 'Latitude', value: `${lat.toFixed(6)}`, sensitive: true });
      add({ group: 'Location', label: 'Longitude', value: `${lon.toFixed(6)}`, sensitive: true });
    }
    for (const [key, label] of Object.entries(GPS_TAGS)) {
      const tag = Number(key);
      const v = g[tag];
      if (v === undefined) continue;
      let text: string | undefined;
      if (tag === 0x0006 && Array.isArray(v)) {
        const below = g[5] instanceof Uint8Array && g[5][0] === 1;
        const alt = below ? -v[0]! : v[0]!;
        if (report.gps) report.gps.altitude = alt;
        text = `${fmtNum(alt, 1)} m`;
      } else if (tag === 0x0007 && Array.isArray(v) && v.length >= 3) {
        text = v.map((x, i) => (i < 2 ? String(Math.floor(x)).padStart(2, '0') : fmtNum(x, 0).padStart(2, '0'))).join(':');
      } else if (tag === 0x0011 && Array.isArray(v)) {
        text = `${fmtNum(v[0]!, 1)}°`;
      } else if (tag === 0x001f && Array.isArray(v)) {
        text = `${fmtNum(v[0]!, 1)} m`;
      } else if (tag === 0x000d && Array.isArray(v)) {
        const unit = { K: 'km/h', M: 'mph', N: 'knots' }[String(g[0x000c] ?? 'K')] ?? '';
        text = `${fmtNum(v[0]!, 1)} ${unit}`.trim();
      } else if (tag === 0x000c || tag === 0x0010) {
        continue;
      } else {
        text = str(v);
      }
      if (text) add({ group: 'Location', label, value: text, sensitive: tag !== 0x0012 });
    }
  };

  const next = readIfd(u32(4), 'main');
  if (next) readIfd(next, 'thumb');
  return report;
}
