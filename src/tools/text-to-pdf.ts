import { bool, createShell, num, processEach, radio, str } from '../lib/shell';
import { formatBytes, suffixName, type OutputFile } from '../lib/files';
import { InputError, UnreadableFile } from '../lib/input-error';
import {
  MAX_TEXT_BYTES,
  TEXT_ERRORS,
  autoFont,
  buildDocDefinition,
  decodeText,
  defaultFontSize,
  looksBinary,
  normaliseText,
  paperForLocale,
  titleFileName,
  undrawableNote,
  type EncodingChoice,
  type FontChoice,
  type PaperChoice,
} from '../lib/text-pdf';
import { renderTextPdf } from '../lib/text-pdf-render';

/**
 * Text to PDF: typed or pasted text, or text files, laid out with pdfmake in a worker
 * (src/lib/text-pdf.ts, src/lib/text-pdf-render.ts). Nothing is uploaded. The analytics events
 * are the shell's own; the text, its length, the file names and the title are never in them.
 */

const plural = (n: number, one: string) => `${n.toLocaleString('en')} ${n === 1 ? one : `${one}s`}`;
const textarea = document.getElementById('tp-text') as HTMLTextAreaElement | null;
const count = document.getElementById('tp-count');
const make = document.getElementById('tp-make') as HTMLButtonElement | null;

/** The file made from the box, so a file named like it that was dropped is not mistaken for typed text. */
let pasted: File | undefined;
/** The font of the file last converted, reported as the output format. */
let lastFont: FontChoice = 'sans';

const shell = createShell({
  outputFormat: () => lastFont,
  resultsTitle: () => 'Converted',
  async process(files, progress) {
    const paper = (str('paper', 'a4') === 'letter' ? 'letter' : 'a4') as PaperChoice;
    const margin = num('tp-margin', 72);
    const fontChoice = radio('tp-font', 'auto');
    const sizeChoice = str('tp-size', 'auto');
    const title = str('tp-title');
    const numbers = bool('tp-numbers');
    const encoding = str('tp-encoding', 'auto') as EncodingChoice;
    return processEach(files, progress, 'Converting', async (entry, i) => {
      const file = entry.file;
      const at = (f: number) => (i + f) / files.length;
      if (file.size > MAX_TEXT_BYTES) throw new InputError(TEXT_ERRORS.tooLarge(file.name, formatBytes(file.size)));
      progress.set(`${file.name}: reading the text`, at(0));
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (looksBinary(bytes)) throw new UnreadableFile(TEXT_ERRORS.notText(file.name));
      const decoded = decodeText(bytes, encoding);
      if (decoded.text.length > 0 && (decoded.text.match(/[\x00-\x08\x0B\x0E-\x1F\x7F]/g)?.length ?? 0) / decoded.text.length > 0.01) {
        throw new UnreadableFile(TEXT_ERRORS.notText(file.name));
      }
      const text = normaliseText(decoded.text);
      if (text.visible === 0) throw new InputError(TEXT_ERRORS.noText(file.name));
      const font: FontChoice = fontChoice === 'sans' || fontChoice === 'mono' ? fontChoice : autoFont(file.name, text.lines, file === pasted);
      lastFont = font;
      const fontSize = sizeChoice === 'auto' ? defaultFontSize(font) : Number(sizeChoice) || defaultFontSize(font);
      progress.set(`${file.name}: setting the pages`, at(0.2));
      const built = buildDocDefinition(text.lines, { paper, margin, font, fontSize, title, numbers });
      if (built.mostlyUndrawable) throw new InputError(TEXT_ERRORS.mostlyUndrawable(file.name));
      const pdf = await renderTextPdf(built.def, { usesMono: built.usesMono, numbers });
      // pdfkit writes each page as its own uncompressed object, so they can be counted directly.
      const pages = (new TextDecoder('latin1').decode(pdf).match(/\/Type \/Page\b(?!s)/g) ?? []).length;
      const note = [
        `${plural(pages, 'page')}, ${font === 'mono' ? 'monospace' : 'Roboto'}, ${paper === 'letter' ? 'Letter' : 'A4'}`,
        decoded.fellBack ? 'read as Western European (Windows-1252) because the file is not valid UTF-8' : '',
        text.controls ? `${plural(text.controls, 'control character')} left out` : '',
        undrawableNote(built.undrawable),
      ].filter(Boolean).join('; ');
      const named = titleFileName(title);
      const out: OutputFile = {
        name: named ? `${named}.pdf` : suffixName(file.name, '', 'pdf'),
        blob: new Blob([pdf as BlobPart], { type: 'application/pdf' }),
        originalSize: file.size,
        note,
      };
      return out;
    });
  },
});

// US, Canadian, Mexican and Philippine browsers get Letter; the locale is read here and goes nowhere.
const paperSelect = document.getElementById('paper') as HTMLSelectElement | null;
if (paperSelect && paperSelect.value === 'a4' && paperForLocale(navigator.language) === 'letter') paperSelect.value = 'letter';

if (textarea && make) {
  const sync = () => {
    const n = [...textarea.value].length;
    if (count) count.textContent = `${n.toLocaleString('en')} character${n === 1 ? '' : 's'}`;
    make.disabled = textarea.value.trim() === '';
  };
  textarea.addEventListener('input', sync);
  make.addEventListener('click', async () => {
    if (textarea.value.trim() === '') return void shell.showError(TEXT_ERRORS.empty);
    // The typed text is the only input: drop files already in the list first.
    if (shell.files.length > 0) document.getElementById('clear')?.click();
    pasted = new File([textarea.value], 'text.txt', { type: 'text/plain' });
    await shell.addFiles([pasted]);
    await shell.execute();
  });
  sync();
}
