import type { Line, TextItem } from './types';

/** The small part of the pdf.js API that is used here, so the same code runs in the browser and in Node. */
export interface PdfJsLike {
  getDocument(src: { data: Uint8Array; useSystemFonts?: boolean; isEvalSupported?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{ getTextContent(): Promise<{ items: unknown[] }> }>;
    }>;
  };
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
}

const isTextItem = (it: unknown): it is PdfTextItem =>
  typeof it === 'object' && it !== null && typeof (it as PdfTextItem).str === 'string' && Array.isArray((it as PdfTextItem).transform);

/** Text of every page, grouped into visual lines (top to bottom) of items (left to right). */
export async function pdfToLines(pdfjs: PdfJsLike, data: Uint8Array): Promise<Line[]> {
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true, isEvalSupported: false }).promise;
  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const rows: { y: number; page: number; items: TextItem[] }[] = [];
    for (const it of tc.items) {
      if (!isTextItem(it)) continue;
      const s = it.str;
      if (!s || !s.trim()) continue;
      const x = it.transform[4];
      const y = it.transform[5];
      let row = rows.find(r => Math.abs(r.y - y) < 2.5);
      if (!row) { row = { y, page: p, items: [] }; rows.push(row); }
      row.items.push({ s: s.trim(), x, r: x + it.width });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const r of rows) {
      r.items.sort((a, b) => a.x - b.x);
      lines.push({ ...r, text: r.items.map(i => i.s).join(' ') });
    }
  }
  return lines;
}
