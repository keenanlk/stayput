/**
 * Read and remove the metadata a PDF carries about who made it and how: the
 * document information dictionary (title, author, software, dates), XMP
 * metadata packets on the document and on individual pages and images,
 * application private data (PieceInfo), and the file identifier. Page content
 * is not touched.
 */
import type * as PdfLib from 'pdf-lib';
import { loadDocument, loadPdfLib } from './pdf';

export interface PdfMetadata {
  /** Document information fields that have a value, in file order. */
  fields: { key: string; value: string }[];
  /** XMP packets found (document level plus pages, images and fonts). */
  xmpPackets: number;
  /** Bytes of XMP metadata. */
  xmpBytes: number;
  /** Objects carrying PieceInfo (private data from Illustrator, Word and others). */
  pieceInfo: number;
  hasId: boolean;
  pages: number;
}

const LABELS: Record<string, string> = {
  Title: 'Title',
  Author: 'Author',
  Subject: 'Subject',
  Keywords: 'Keywords',
  Creator: 'Created with',
  Producer: 'Made into PDF by',
  CreationDate: 'Created',
  ModDate: 'Modified',
  Trapped: 'Trapped',
};

export const fieldLabel = (key: string): string => LABELS[key] ?? key;

/** "D:20240101120000+01'00'" → "2024-01-01 12:00". */
function pdfDate(raw: string): string {
  const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?/.exec(raw);
  if (!m) return raw;
  const [, y, mo = '01', d = '01', h, mi] = m;
  return `${y}-${mo}-${d}${h ? ` ${h}:${mi ?? '00'}` : ''}`;
}

function text(lib: typeof PdfLib, obj: PdfLib.PDFObject | undefined): string | undefined {
  if (obj instanceof lib.PDFString || obj instanceof lib.PDFHexString) return obj.decodeText();
  if (obj instanceof lib.PDFName) return obj.decodeText();
  return undefined;
}

function dictOf(lib: typeof PdfLib, obj: PdfLib.PDFObject | undefined): PdfLib.PDFDict | undefined {
  if (obj instanceof lib.PDFDict) return obj;
  if (obj instanceof lib.PDFStream) return obj.dict;
  return undefined;
}

function infoDict(lib: typeof PdfLib, doc: PdfLib.PDFDocument): PdfLib.PDFDict | undefined {
  const info = doc.context.trailerInfo.Info;
  const resolved = info instanceof lib.PDFRef ? doc.context.lookup(info) : info;
  return resolved instanceof lib.PDFDict ? resolved : undefined;
}

function survey(lib: typeof PdfLib, doc: PdfLib.PDFDocument): PdfMetadata {
  const fields: PdfMetadata['fields'] = [];
  const info = infoDict(lib, doc);
  if (info) {
    for (const [k, v] of info.entries()) {
      const key = k.decodeText();
      let value = text(lib, v instanceof lib.PDFRef ? doc.context.lookup(v) : v)?.trim();
      if (!value) continue;
      if (key === 'CreationDate' || key === 'ModDate') value = pdfDate(value);
      fields.push({ key, value });
    }
  }
  let xmpPackets = 0;
  let xmpBytes = 0;
  let pieceInfo = 0;
  const Metadata = lib.PDFName.of('Metadata');
  const PieceInfo = lib.PDFName.of('PieceInfo');
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    const d = dictOf(lib, obj);
    if (!d) continue;
    if (d.get(PieceInfo)) pieceInfo++;
    const type = d.get(lib.PDFName.of('Type'));
    if (obj instanceof lib.PDFStream && type === Metadata) {
      xmpPackets++;
      xmpBytes += obj.getContentsSize();
    }
  }
  return { fields, xmpPackets, xmpBytes, pieceInfo, hasId: Boolean(doc.context.trailerInfo.ID), pages: doc.getPageCount() };
}

export async function readPdfMetadata(bytes: Uint8Array): Promise<PdfMetadata> {
  const lib = await loadPdfLib();
  return survey(lib, await loadDocument(bytes));
}

/** The PDF without its metadata, plus what was there before. */
export async function removePdfMetadata(bytes: Uint8Array): Promise<{ bytes: Uint8Array; before: PdfMetadata }> {
  const lib = await loadPdfLib();
  const doc = await loadDocument(bytes);
  const before = survey(lib, doc);
  const ctx = doc.context;
  const Metadata = lib.PDFName.of('Metadata');
  const PieceInfo = lib.PDFName.of('PieceInfo');
  const drop = new Set<PdfLib.PDFRef>();
  const forget = (v: PdfLib.PDFObject | undefined) => {
    if (v instanceof lib.PDFRef) drop.add(v);
  };

  // Every /Metadata and /PieceInfo entry, on the catalog, pages, images and fonts.
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    const d = dictOf(lib, obj);
    if (!d) continue;
    if (obj instanceof lib.PDFStream && d.get(lib.PDFName.of('Type')) === Metadata) drop.add(ref);
    forget(d.get(Metadata));
    forget(d.get(PieceInfo));
    d.delete(Metadata);
    d.delete(PieceInfo);
  }
  // The information dictionary and the file identifier.
  forget(ctx.trailerInfo.Info);
  ctx.trailerInfo.Info = undefined;
  ctx.trailerInfo.ID = undefined;
  // pdf-lib writes every object it holds, referenced or not, so anything the
  // document no longer points to (the metadata just unlinked, private data
  // hanging off PieceInfo, leftovers from earlier edits) is deleted outright.
  for (const ref of drop) ctx.delete(ref);
  const reachable = new Set<PdfLib.PDFRef>();
  const walk = (start: PdfLib.PDFObject | undefined) => {
    const stack: (PdfLib.PDFObject | undefined)[] = [start];
    while (stack.length) {
      const o = stack.pop();
      if (o instanceof lib.PDFRef) {
        if (reachable.has(o)) continue;
        reachable.add(o);
        stack.push(ctx.lookup(o));
      } else if (o instanceof lib.PDFDict) {
        for (const [, v] of o.entries()) stack.push(v);
      } else if (o instanceof lib.PDFStream) {
        stack.push(o.dict);
      } else if (o instanceof lib.PDFArray) {
        for (let i = 0; i < o.size(); i++) stack.push(o.get(i));
      }
    }
  };
  walk(ctx.trailerInfo.Root);
  walk(ctx.trailerInfo.Encrypt);
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!reachable.has(ref)) ctx.delete(ref);

  const out = await doc.save({ useObjectStreams: true, updateFieldAppearances: false });
  return { bytes: out, before };
}
