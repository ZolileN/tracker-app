/* Browser entry point: read one uploaded file. pdf.js is loaded on first use, so the app starts fast. */
import { pdfToLines, type PdfJsLike } from './pdf';
import { parseStatementLines } from './statement';
import { parseTextStatement } from './text';
import { emptyResult, type Line, type ParseResult } from './types';

let pdfjs: Promise<PdfJsLike> | null = null;

function loadPdfJs(): Promise<PdfJsLike> {
  pdfjs ??= (async () => {
    const [lib, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib as unknown as PdfJsLike;
  })().catch(e => {
    pdfjs = null;
    throw e;
  });
  return pdfjs;
}

export interface ReadResult {
  res: ParseResult;
  /** The PDF is password-protected: 'need' = no password given yet, 'wrong' = the one given did not open it */
  locked?: 'need' | 'wrong';
  /** What was read, kept in memory only, for "share this statement's layout" */
  lines?: Line[];
  text?: string;
}

/** pdf.js signals a locked PDF with a PasswordException: code 1 = needs a password, 2 = wrong password. */
function passwordState(e: unknown): 'need' | 'wrong' | null {
  const x = e as { name?: string; code?: number; message?: string } | null;
  if (x?.name !== 'PasswordException' && !/password/i.test(x?.message ?? '')) return null;
  return x?.code === 2 ? 'wrong' : 'need';
}

/** Read a statement file. `password` opens a protected PDF; it is used once and never stored. */
export async function readStatementFile(file: File, password?: string): Promise<ReadResult> {
  try {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      // a fresh copy each time: pdf.js hands the buffer to its worker
      const lines = await pdfToLines(await loadPdfJs(), new Uint8Array(await file.arrayBuffer()), password);
      if (!lines.length) return { res: emptyResult(null, ['This PDF has no readable text (it may be a scan or a photo of a statement).']), lines };
      return { res: parseStatementLines(lines), lines };
    }
    const text = await file.text();
    return { res: parseTextStatement(text, file.name), text };
  } catch (e) {
    const locked = passwordState(e);
    if (locked) {
      return {
        res: emptyResult(null, [locked === 'wrong' ? 'That password did not open this PDF. Try again.' : 'This PDF is password-protected.']),
        locked,
      };
    }
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    return { res: emptyResult(null, ['Could not read this file: ' + msg]) };
  }
}
