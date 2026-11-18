# Budget Tracker

Personal budget app for South African bank statements. Upload PDF statements from any South
African bank (Absa, Capitec, FNB, Nedbank, Standard Bank, GoTyme (TymeBank), Discovery, Investec,
African Bank, Bidvest, Old Mutual, Bank Zero and others) or a CSV, OFX/QFX or QIF download,
check they reconcile, categorise spending, and budget per pay cycle.

A TypeScript + React web app that installs on a phone (PWA) and works offline.
Statements are read on your device; nothing is uploaded anywhere.

## Run it

Needs Node 22.13 or newer.

```sh
npm install
npm run dev          # http://localhost:5173, also reachable from your phone on the same Wi-Fi
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload |
| `npm run build` | Typecheck, then build the static site into `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Unit and layout tests (Vitest) |
| `npm run typecheck` | TypeScript only |
| `npm run check-statements -- file.pdf [more files] [--tx]` | Run real statements through the parser and check they reconcile |

### On your iPhone

`dist/` is a plain static site: host it anywhere that serves files over HTTPS (Netlify,
Cloudflare Pages, GitHub Pages, Vercel...). Open it in Safari, tap Share → **Add to Home Screen**.
It then opens full-screen like an app and works offline, including reading PDFs.
(Installing needs HTTPS; the dev server's plain-HTTP address works in the browser but will not install.)

## Your data

- Saved in the browser's storage on each device, under the key `budget-tracker-v1`. It does not sync
  between devices. Use **Settings → Download backup** now and then, and **Restore from backup** to
  move data to another device.
- Backups from the original single-file version (`legacy/index.html`) restore into this version
  unchanged, so that is how to bring old data across.

## Supported statements

| Source | How it is read | Checked against |
| --- | --- | --- |
| Capitec, Nedbank, FNB PDF | Bank-specific parsers (`src/parser/specific.ts`) | Real statements |
| Absa PDF (transaction history), Discovery PDF | Generic column parser | Real statements |
| GoTyme (TymeBank) PDF | Generic column parser | Fixture built from a real statement layout |
| Any other bank's PDF | Generic column parser (`src/parser/generic.ts`) | Layout fixtures in `tests/fixtures.ts` |
| CSV (with or without a header row), OFX / QFX, QIF | `src/parser/text.ts` | Layout fixtures |

The generic parser finds the table by its column headings (Date, Description, Debit, Credit,
Amount, Fee, Balance in any order and wording), reads dates in any common format (including
year-less `12 Mar` and `03 12`, resolved from the statement period) and amounts written as
`-R1 234.56`, `250.00-`, `1 234.56 Cr`, `(80.00)`, `1 234,56` or `R150`. It then follows the
running balance to settle each row's sign and whether a fee column was charged or only accrued,
and flags rows that do not follow it. If a bank-specific parser fails to reconcile (for example
after a layout change), the generic parser is tried and the better result is used.
Bank confirmation letters, empty periods and pending transactions are recognised and explained.

## Code

```
src/
  parser/      statement reading; no browser or React code, so it also runs in Node
    banks.ts     bank detection (legal names and domains)
    specific.ts  Capitec, Nedbank, FNB
    generic.ts   any other bank's PDF
    text.ts      CSV, OFX, QIF
    readFile.ts  browser entry point; loads pdf.js on first use
  domain/      pure logic: categories and rules, pay-cycle periods, importing, backups
  state/       Zustand store (all actions) and derived-data hooks; saves to localStorage
  ui/          screens: Overview, Transactions, Budget, Import, Settings, and the add/edit dialog
tests/         Vitest: parser layouts, CSV/OFX/QIF, domain logic
tools/         check-statements.ts (real files), build_excel_pilot.py
legacy/        the original single-file HTML version, kept for reference
```

## Adding a bank

Most banks need nothing: add the bank to `SA_BANKS` in `src/parser/banks.ts` (legal-name and
domain markers, so a payment that mentions the bank does not change detection) and the generic
parser reads its table. Run `npm run check-statements -- statement.pdf` on a few real statements
and check that they reconcile. Add a fixture to `tests/fixtures.ts` for any new layout trait.

Only if the generic parser cannot read a layout, write a parser in `src/parser/specific.ts`
returning a `ParseResult` and register it in `SPECIFIC` in `src/parser/statement.ts`.
