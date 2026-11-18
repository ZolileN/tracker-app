/* Browser entry point: read one uploaded file. pdf.js is loaded on first use, so the app starts fast. */
import { pdfToLines, type PdfJsLike } from './pdf';
import { parseStatementLines } from './statement';
import { parseTextStatement } from './text';
import { emptyResult, type ParseResult } from './types';

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

export async function readStatementFile(file: File): Promise<ParseResult> {
  try {
    if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
      const lines = await pdfToLines(await loadPdfJs(), new Uint8Array(await file.arrayBuffer()));
      if (!lines.length) return emptyResult(null, ['This PDF has no readable text (it may be a scan or a photo of a statement).']);
      return parseStatementLines(lines);
    }
    return parseTextStatement(await file.text(), file.name);
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : String(e);
    const pw = /password/i.test(msg) || (e as { name?: string })?.name === 'PasswordException';
    return emptyResult(null, [pw ? 'This PDF is password-protected. Save an unlocked copy and try again.' : 'Could not read this file: ' + msg]);
  }
}
