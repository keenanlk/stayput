/**
 * Stayput's PDF and photo tools as an MCP server. Every tool reads and writes
 * files on this machine with the same code the website runs in the browser
 * (../../src/lib); nothing is sent over the network.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { mergePdfs, extractPages, rotatePages, imagesToPdf, addPageNumbers, loadDocument, type NumberPosition } from '../../src/lib/pdf';
import { parsePageRange, chunkPages, describePages } from '../../src/lib/ranges';
import { inspect, strip, sniffFormat, type MetadataSummary } from '../../src/lib/exif';
import { withPassword } from './unlock';

export const VERSION = '0.1.0';
const SITE = 'https://stayput.dev';

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

/** Resolve a user path: `~` is the home folder, relative paths are from the working directory. */
function abs(p: string): string {
  const t = p.trim();
  if (t === '~' || t.startsWith('~/')) return join(homedir(), t.slice(1));
  return resolve(process.cwd(), t);
}

async function read(p: string): Promise<Uint8Array> {
  const path = abs(p);
  try {
    return new Uint8Array(await readFile(path));
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw new Error(code === 'ENOENT' ? `No file at ${path}.` : code === 'EISDIR' ? `${path} is a folder, not a file.` : `Could not read ${path} (${code ?? String(e)}).`);
  }
}

const exists = (p: string) => stat(p).then(() => true, () => false);

/** First free name: file.pdf, file-1.pdf, file-2.pdf ... Existing files are never overwritten. */
async function freePath(path: string): Promise<string> {
  const ext = extname(path);
  const stem = path.slice(0, path.length - ext.length);
  let candidate = path;
  for (let i = 1; await exists(candidate); i++) candidate = `${stem}-${i}${ext}`;
  return candidate;
}

/** Output path: the one given (made unique), or `<first input>-<suffix><ext>` beside the input. */
async function outPath(given: string | undefined, input: string, suffix: string, ext: string): Promise<string> {
  if (given) return freePath(abs(given));
  const src = abs(input);
  return freePath(join(dirname(src), `${basename(src, extname(src))}-${suffix}${ext}`));
}

async function save(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: 'wx' });
}

const size = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/* ------------------------------------------------------------------ */
/* Results                                                             */
/* ------------------------------------------------------------------ */

function ok(text: string, structured: Record<string, unknown>): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent: structured };
}

/** Run a tool body; any thrown error becomes a readable tool error instead of a protocol failure. */
async function guard(password: string | undefined, fn: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await withPassword(password, fn);
  } catch (e) {
    return { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : String(e) }] };
  }
}

async function pdfPages(bytes: Uint8Array): Promise<number> {
  return (await loadDocument(bytes)).getPageCount();
}

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

const password = z.string().optional().describe('Password for a PDF that asks for one when opened. Used only on this machine.');
const output = z.string().optional().describe('Where to write the result. Defaults to a new file beside the input. Existing files are never overwritten; a free name like file-1.pdf is used instead.');

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'stayput', title: 'Stayput', version: VERSION, websiteUrl: SITE },
    {
      instructions:
        'Local PDF and photo tools. Paths are on this machine: absolute, ~/..., or relative to the working directory. Tools never modify or overwrite input files; they write a new file and return its path. Nothing is uploaded. Encrypted PDFs are decrypted locally; pass "password" when one is needed. For formats these tools do not cover (HEIC, WebP, AVIF conversion, compression, PDF to image), point the user to https://stayput.dev, which runs the same way in the browser.',
    },
  );

  server.registerTool(
    'pdf_info',
    {
      title: 'PDF info',
      description: 'Read a PDF on this machine and report its page count, page sizes, title and whether it was encrypted. Use before splitting, extracting or rotating to learn how many pages there are.',
      inputSchema: { path: z.string().describe('Path to the PDF.'), password },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ path, password: pw }) =>
      guard(pw, async () => {
        const bytes = await read(path);
        const doc = await loadDocument(bytes);
        const sizes = doc.getPages().map((p) => {
          const { width, height } = p.getSize();
          return `${Math.round(width)}x${Math.round(height)} pt`;
        });
        const distinct = [...new Set(sizes)];
        const title = doc.getTitle();
        const lines = [`${abs(path)}: ${plural(doc.getPageCount(), 'page')}, ${size(bytes.length)}.`, `Page size: ${distinct.slice(0, 5).join(', ')}${distinct.length > 5 ? ', ...' : ''}.`];
        if (title) lines.push(`Title: ${title}`);
        return ok(lines.join('\n'), { path: abs(path), pages: doc.getPageCount(), bytes: bytes.length, pageSizes: distinct, title: title ?? null });
      }),
  );

  server.registerTool(
    'merge_pdfs',
    {
      title: 'Merge PDFs',
      description: 'Combine several PDFs on this machine into one, in the order given. The same file may appear more than once. Writes a new PDF and returns its path.',
      inputSchema: { inputs: z.array(z.string()).min(1).describe('PDF paths, in the order their pages should appear.'), output, password },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ inputs, output: out, password: pw }) =>
      guard(pw, async () => {
        const sources = await Promise.all(inputs.map(read));
        const bytes = await mergePdfs(sources);
        const dest = await outPath(out, inputs[0]!, 'merged', '.pdf');
        await save(dest, bytes);
        const n = await pdfPages(bytes);
        return ok(`Merged ${plural(inputs.length, 'file')} into ${dest} (${plural(n, 'page')}, ${size(bytes.length)}).`, { output: dest, pages: n, bytes: bytes.length });
      }),
  );

  server.registerTool(
    'extract_pdf_pages',
    {
      title: 'Extract, reorder or delete PDF pages',
      description: 'Write a new PDF containing only the listed pages, in the listed order. Use it to pull out a range, reorder pages ("3,1,2") or drop pages (list the ones to keep). Pages are 1-based; ranges like "1-3, 7" and reversed ranges like "5-1" work.',
      inputSchema: { input: z.string().describe('Path to the PDF.'), pages: z.string().describe('Pages to keep, for example "1-3, 7" or "3,1,2".'), output, password },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ input, pages, output: out, password: pw }) =>
      guard(pw, async () => {
        const src = await read(input);
        const indexes = parsePageRange(pages, await pdfPages(src));
        const bytes = await extractPages(src, indexes);
        const dest = await outPath(out, input, 'pages', '.pdf');
        await save(dest, bytes);
        return ok(`Wrote ${dest} with ${describePages(indexes)} (${plural(indexes.length, 'page')}, ${size(bytes.length)}).`, { output: dest, pages: indexes.length, bytes: bytes.length });
      }),
  );

  server.registerTool(
    'split_pdf',
    {
      title: 'Split PDF',
      description: 'Split a PDF into several files of N pages each (1 = one file per page), written into a folder. Returns the list of files.',
      inputSchema: {
        input: z.string().describe('Path to the PDF.'),
        pages_per_file: z.number().int().min(1).default(1).describe('Pages in each output file. Default 1.'),
        output_dir: z.string().optional().describe('Folder for the parts. Defaults to a new folder beside the input named <file>-split.'),
        password,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ input, pages_per_file, output_dir, password: pw }) =>
      guard(pw, async () => {
        const src = await read(input);
        const stem = basename(abs(input), extname(input));
        const folder = output_dir ? abs(output_dir) : await freePath(join(dirname(abs(input)), `${stem}-split`));
        const written: string[] = [];
        for (const chunk of chunkPages(await pdfPages(src), pages_per_file)) {
          const first = chunk[0]! + 1;
          const last = chunk[chunk.length - 1]! + 1;
          const dest = await freePath(join(folder, `${stem}-pages-${first === last ? first : `${first}-${last}`}.pdf`));
          await save(dest, await extractPages(src, chunk));
          written.push(dest);
        }
        return ok(`Split into ${plural(written.length, 'file')} in ${folder}:\n${written.map((w) => `- ${basename(w)}`).join('\n')}`, { outputDir: folder, files: written });
      }),
  );

  server.registerTool(
    'rotate_pdf',
    {
      title: 'Rotate PDF pages',
      description: 'Rotate all pages, or only the listed ones, clockwise by 90, 180 or 270 degrees, and save the rotation permanently in a new PDF.',
      inputSchema: {
        input: z.string().describe('Path to the PDF.'),
        degrees: z.union([z.literal(90), z.literal(180), z.literal(270)]).describe('Clockwise rotation to add.'),
        pages: z.string().optional().describe('Pages to rotate, for example "1, 3-4". Default: every page.'),
        output,
        password,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ input, degrees, pages, output: out, password: pw }) =>
      guard(pw, async () => {
        const src = await read(input);
        const doc = await loadDocument(src);
        const count = doc.getPageCount();
        const chosen = new Set(pages ? parsePageRange(pages, count) : doc.getPageIndices());
        const rotations = doc.getPages().map((p, i) => p.getRotation().angle + (chosen.has(i) ? degrees : 0));
        const bytes = await rotatePages(src, rotations);
        const dest = await outPath(out, input, 'rotated', '.pdf');
        await save(dest, bytes);
        return ok(`Rotated ${plural(chosen.size, 'page')} by ${degrees} degrees. Wrote ${dest} (${size(bytes.length)}).`, { output: dest, rotatedPages: chosen.size, bytes: bytes.length });
      }),
  );

  server.registerTool(
    'number_pdf_pages',
    {
      title: 'Add page numbers',
      description: 'Stamp page numbers on a PDF. The template may use {n} for the page number and {total} for the last number, e.g. "Page {n} of {total}".',
      inputSchema: {
        input: z.string().describe('Path to the PDF.'),
        template: z.string().default('{n}').describe('Text to print. Default "{n}".'),
        position: z.enum(['bottom-center', 'bottom-left', 'bottom-right', 'top-center', 'top-left', 'top-right']).default('bottom-center'),
        start: z.number().int().default(1).describe('Number printed on the first numbered page.'),
        first_page: z.number().int().min(1).default(1).describe('First page (1-based) that gets a number; earlier pages, such as a cover, are left blank.'),
        font_size: z.number().min(4).max(72).default(11),
        output,
        password,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ input, template, position, start, first_page, font_size, output: out, password: pw }) =>
      guard(pw, async () => {
        const src = await read(input);
        const { bytes, numbered } = await addPageNumbers(src, { template, position: position as NumberPosition, start, firstPage: first_page - 1, fontSize: font_size, margin: 28, font: 'helvetica', color: '#333333' });
        const dest = await outPath(out, input, 'numbered', '.pdf');
        await save(dest, bytes);
        return ok(`Numbered ${plural(numbered, 'page')}. Wrote ${dest} (${size(bytes.length)}).`, { output: dest, numberedPages: numbered, bytes: bytes.length });
      }),
  );

  server.registerTool(
    'images_to_pdf',
    {
      title: 'Images to PDF',
      description: 'Put JPG and PNG images into one PDF, one image per page, in the order given. Images are embedded as they are, without re-compression.',
      inputSchema: {
        inputs: z.array(z.string()).min(1).describe('JPG or PNG paths, in page order.'),
        page_size: z.enum(['fit', 'a4', 'letter']).default('fit').describe('"fit" makes each page the size of its image; "a4" and "letter" centre the image on a standard page.'),
        margin: z.number().min(0).max(144).default(0).describe('Margin in points (72 = 1 inch).'),
        output,
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ inputs, page_size, margin, output: out }) =>
      guard(undefined, async () => {
        const images = await Promise.all(
          inputs.map(async (p) => {
            const bytes = await read(p);
            const kind = sniffFormat(bytes);
            if (kind === 'jpeg') return { kind: 'jpg' as const, bytes };
            if (kind === 'png') return { kind: 'png' as const, bytes };
            throw new Error(`${abs(p)} is not a JPG or PNG. Convert it first, for example at ${SITE}/tools/image-to-pdf, which also takes HEIC and WebP and runs in the browser.`);
          }),
        );
        const bytes = await imagesToPdf(images, { pageSize: page_size, orientation: 'auto', margin });
        const dest = await outPath(out, inputs[0]!, 'images', '.pdf');
        await save(dest, bytes);
        return ok(`Wrote ${dest} (${plural(images.length, 'page')}, ${size(bytes.length)}).`, { output: dest, pages: images.length, bytes: bytes.length });
      }),
  );

  const describe = (s: MetadataSummary): string[] => [
    `Metadata found: ${s.kinds.length ? s.kinds.join(', ') : 'none'} (${size(s.bytes)} removable).`,
    `GPS location: ${s.hasGps ? 'yes' : 'no'}.`,
    ...(s.make || s.model ? [`Camera: ${[s.make, s.model].filter(Boolean).join(' ')}.`] : []),
    ...(s.dateTime ? [`Taken: ${s.dateTime}.`] : []),
    ...(s.software ? [`Software: ${s.software}.`] : []),
  ];

  server.registerTool(
    'inspect_image_metadata',
    {
      title: 'Inspect photo metadata',
      description: 'Report the metadata hidden in a JPG, PNG or WebP photo: GPS location, camera make and model, capture time, editing software, and which blocks (EXIF, XMP, IPTC, comments) are present. HEIC files report EXIF only.',
      inputSchema: { path: z.string().describe('Path to the image.') },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    ({ path }) =>
      guard(undefined, async () => {
        const bytes = await read(path);
        if (sniffFormat(bytes) === 'unknown') throw new Error(`${abs(path)} is not a JPG, PNG, WebP or HEIC image.`);
        const s = inspect(bytes);
        return ok([`${abs(path)}:`, ...describe(s)].join('\n'), { path: abs(path), ...s });
      }),
  );

  server.registerTool(
    'strip_image_metadata',
    {
      title: 'Remove photo metadata',
      description: 'Write a copy of a JPG, PNG or WebP photo with EXIF (including GPS location), XMP, IPTC and comments removed. Lossless: the image data is not re-encoded. The original file is left untouched.',
      inputSchema: {
        input: z.string().describe('Path to the image.'),
        keep_color_profile: z.boolean().default(true).describe('Keep the ICC colour profile so colours look the same. Default true.'),
        output: z.string().optional().describe('Where to write the cleaned copy. Defaults to <name>-clean.<ext> beside the input. Existing files are never overwritten.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    ({ input, keep_color_profile, output: out }) =>
      guard(undefined, async () => {
        const src = await read(input);
        const format = sniffFormat(src);
        if (format === 'unknown' || format === 'heif') throw new Error(`${abs(input)} is not a JPG, PNG or WebP image. For HEIC photos, convert to JPG first (${SITE}/tools/heic-to-jpg drops the metadata by default).`);
        const { bytes, summary } = strip(src, { keepIcc: keep_color_profile });
        const dest = await outPath(out, input, 'clean', extname(input) || (format === 'jpeg' ? '.jpg' : `.${format}`));
        await save(dest, bytes);
        return ok([`Wrote ${dest} (${size(bytes.length)}). The original had:`, ...describe(summary)].join('\n'), { output: dest, bytes: bytes.length, removed: summary });
      }),
  );

  return server;
}
