/**
 * Runs a JSON/CSV conversion off the main thread, so the page keeps responding while a large file
 * is parsed. It reads the file itself and sends back the result as a Blob, plus a short preview.
 */
import { convert, DataError, stripBom, type Converted, type Job } from './csv-json';
import { NamedError } from './input-error';

export type Request = { id: number; file: File; job: Job; bom: boolean };
export type Reply =
  | { id: number; type: 'done'; blob: Blob; summary: Omit<Converted, 'text'> }
  | { id: number; type: 'error'; name: string; message: string; arrays?: string[] };

const BOM = '﻿';

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, file, job, bom } = e.data;
  const post = (msg: Reply) => (self as unknown as Worker).postMessage(msg);
  try {
    const { text, ...summary } = convert(stripBom(await file.text()), job);
    const withBom = bom && job.direction === 'json-to-csv';
    const type = job.direction === 'json-to-csv' ? 'text/csv;charset=utf-8' : 'application/json';
    post({ id, type: 'done', blob: new Blob(withBom ? [BOM, text] : [text], { type }), summary });
  } catch (err) {
    const e2 = err instanceof Error ? err : new NamedError('CsvJsonWorkerFailed', String(err));
    post({ id, type: 'error', name: e2.name, message: e2.message, arrays: err instanceof DataError ? err.arrays : undefined });
  }
};
