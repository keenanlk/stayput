/**
 * Read and fill the fields of a fillable PDF (an AcroForm) with pdf-lib. The
 * page each field sits on and its rectangle come from its widgets, so the
 * fill-in page can put an input exactly over each box.
 */
import type * as PdfLib from 'pdf-lib';
import { loadDocument, loadPdfLib } from './pdf';

export type FieldKind = 'text' | 'multiline' | 'checkbox' | 'radio' | 'dropdown' | 'list' | 'signature' | 'button';

export interface FieldWidget {
  /** Page index, from 0. */
  page: number;
  /** Rectangle in PDF user space: [x1, y1, x2, y2]. */
  rect: [number, number, number, number];
  /** For a radio button, the option this widget stands for. */
  option?: string;
}

export interface FormField {
  name: string;
  kind: FieldKind;
  /** Text, the chosen option, or 'true'/'false' for a checkbox. */
  value: string;
  options?: string[];
  maxLength?: number;
  readOnly: boolean;
  widgets: FieldWidget[];
}

type Lib = typeof PdfLib;

function kindOf(lib: Lib, f: PdfLib.PDFField): FieldKind {
  if (f instanceof lib.PDFTextField) return f.isMultiline() ? 'multiline' : 'text';
  if (f instanceof lib.PDFCheckBox) return 'checkbox';
  if (f instanceof lib.PDFRadioGroup) return 'radio';
  if (f instanceof lib.PDFDropdown) return 'dropdown';
  if (f instanceof lib.PDFOptionList) return 'list';
  if (f instanceof lib.PDFSignature) return 'signature';
  return 'button';
}

function pageIndexOf(doc: PdfLib.PDFDocument, lib: Lib, widget: PdfLib.PDFWidgetAnnotation): number {
  const pages = doc.getPages();
  const pageRef = widget.P();
  if (pageRef) {
    const i = pages.findIndex((p) => p.ref === pageRef || p.ref.toString() === pageRef.toString());
    if (i >= 0) return i;
  }
  // Some forms leave out the widget's page; find the page whose annotations list it.
  const ref = doc.context.getObjectRef(widget.dict);
  if (ref) {
    const i = pages.findIndex((p) => {
      const annots = p.node.Annots();
      return !!annots && annots.asArray().some((a) => a instanceof lib.PDFRef && a.toString() === ref.toString());
    });
    if (i >= 0) return i;
  }
  return -1;
}

export async function readForm(doc: PdfLib.PDFDocument): Promise<FormField[]> {
  const lib = await loadPdfLib();
  const form = doc.getForm();
  const out: FormField[] = [];
  for (const f of form.getFields()) {
    const kind = kindOf(lib, f);
    const options = f instanceof lib.PDFRadioGroup || f instanceof lib.PDFDropdown || f instanceof lib.PDFOptionList ? f.getOptions() : undefined;
    const widgets: FieldWidget[] = [];
    f.acroField.getWidgets().forEach((w, i) => {
      const page = pageIndexOf(doc, lib, w);
      if (page < 0) return;
      const r = w.getRectangle();
      if (r.width <= 0 || r.height <= 0) return;
      let option: string | undefined;
      if (kind === 'radio') {
        const on = w.getOnValue()?.decodeText();
        option = on !== undefined && options?.includes(on) ? on : options?.[i];
      }
      widgets.push({ page, rect: [r.x, r.y, r.x + r.width, r.y + r.height], option });
    });
    let value = '';
    if (f instanceof lib.PDFTextField) value = f.getText() ?? '';
    else if (f instanceof lib.PDFCheckBox) value = String(f.isChecked());
    else if (f instanceof lib.PDFRadioGroup) value = f.getSelected() ?? '';
    else if (f instanceof lib.PDFDropdown || f instanceof lib.PDFOptionList) value = f.getSelected()[0] ?? '';
    out.push({
      name: f.getName(),
      kind,
      value,
      options,
      maxLength: f instanceof lib.PDFTextField ? f.getMaxLength() : undefined,
      readOnly: f.isReadOnly(),
      widgets,
    });
  }
  return out;
}

export interface FillResult {
  bytes: Uint8Array;
  /** Fields that hold an answer after filling. */
  answered: number;
  flattened: boolean;
}

/**
 * Write the answers into the form. With `flatten`, the answers become part of
 * the page and the fields are removed, so nobody can change them later.
 */
export async function fillForm(source: Uint8Array, values: Record<string, string>, { flatten = false } = {}): Promise<FillResult> {
  const lib = await loadPdfLib();
  const doc = await loadDocument(source);
  const form = doc.getForm();
  let answered = 0;
  for (const f of form.getFields()) {
    const v = values[f.getName()];
    if (v === undefined || f.isReadOnly()) continue;
    if (f instanceof lib.PDFTextField) {
      const max = f.getMaxLength();
      const text = max !== undefined ? v.slice(0, max) : v;
      // pdf-lib refuses to write several lines into a single-line box.
      f.setText(f.isMultiline() ? text : text.replace(/\s*\n\s*/g, ' ') || undefined);
      if (text) answered++;
    } else if (f instanceof lib.PDFCheckBox) {
      if (v === 'true') {
        f.check();
        answered++;
      } else f.uncheck();
    } else if (f instanceof lib.PDFRadioGroup) {
      if (v && f.getOptions().includes(v)) {
        f.select(v);
        answered++;
      } else if (!v) f.clear();
    } else if (f instanceof lib.PDFDropdown || f instanceof lib.PDFOptionList) {
      if (v) {
        f.select(v);
        answered++;
      } else f.clear();
    }
  }
  const font = await doc.embedFont(lib.StandardFonts.Helvetica);
  try {
    form.updateFieldAppearances(font);
  } catch (e) {
    // The standard font covers Western European letters only. Without it the
    // answers are still saved, and PDF readers draw them in their own font.
    const bad = e instanceof Error && /cannot encode/i.test(e.message);
    if (!bad) throw e;
    if (flatten) throw new Error('Some answers use letters the built-in PDF font cannot draw (for example Greek, Cyrillic, Chinese or emoji), so the form cannot be flattened. Untick “Lock the answers” to save it as a fillable form instead.');
    form.acroForm.dict.set(lib.PDFName.of('NeedAppearances'), lib.PDFBool.True);
    const bytes = await doc.save({ updateFieldAppearances: false });
    return { bytes, answered, flattened: false };
  }
  if (flatten) form.flatten({ updateFieldAppearances: false });
  const bytes = await doc.save({ updateFieldAppearances: false });
  return { bytes, answered, flattened: flatten };
}
