# Budget Tracker

Personal budget app for South African bank statements. Upload PDF statements from any South
African bank (Absa, Capitec, FNB, Nedbank, Standard Bank, GoTyme (TymeBank), Discovery, Investec,
African Bank, Bidvest, Old Mutual, Bank Zero and others) or a CSV, OFX/QFX or QIF download,
check they reconcile, categorise spending, and budget per pay cycle.

Features: any date range (pay periods or custom dates), a budget per month that you can plan
ahead for next month, spending by category, insights, charts, rules that learn your categories,
and bank logos showing which statements it can read.

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
| `npm run check-layout -- statement-layout.json [--lines]` | Look at a masked layout a tester shared from the app, and try the parser on it |

### Deploy to Vercel

`vercel.json` holds the build settings and security headers (a strict Content Security Policy:
the app loads nothing from other sites). `npm run preview` serves the same headers locally.

Either import the GitHub repo in the Vercel dashboard (it picks up `vercel.json`), or from here:

```sh
npx vercel login
npx vercel --prod
```

Optional: set `VITE_FEEDBACK_URL` (e.g. a Google Form) under Project → Settings → Environment
Variables, then redeploy. It adds a "Send feedback" link to the welcome screen and Settings → About.

### On a phone

Open the site and install it: on iPhone, Safari → Share → **Add to Home Screen**; on Android, the
app offers an **Install** button. Installing matters on iPhone: Safari can clear a website's data
after about a week without a visit, but not an installed app's. The app shows this tip itself.

## Testing with friends

- The app is marked **Beta** and shows its version in Settings → About; ask testers to quote it.
- Password-protected statements open in the app (the password is used once and never saved).
- If a statement is not read correctly, the tester taps **"Not read correctly? Share this statement's
  layout"** on the Import screen and sends you the file. It has the position of every piece of text
  with names, account numbers, amounts and descriptions masked (only dates, column headings, month
  names and bank names are kept). Run `npm run check-layout -- that-file.json` to see what the parser
  makes of it, then add a fixture with made-up values to `tests/fixtures.ts`.
- The app reminds people to download a backup every 30 days once they have data.

## Your data

- Saved in the browser's storage on each device, under the key `budget-tracker-v1`. It does not sync
  between devices. Use **Settings → Download backup** now and then, and **Restore from backup** to
  move data to another device.
- Backups from the original single-file version (`legacy/index.html`) restore into this version
  unchanged, so that is how to bring old data across.

## Budgets

Each pay period can have its own budget (**Budget → Plan next month**, or pick any month and
start from a copy of the current budget, your average spending, or empty). A budget applies from
its month onwards until a later month gets its own, so planning next month never changes past
months. For a custom date range, the Overview prorates the budget by day.

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
  domain/      pure logic: categories and rules, pay-cycle periods, budgets per month, importing, backups
  state/       Zustand store (all actions) and derived-data hooks; saves to localStorage
  ui/          screens: Overview, Transactions, Budget, Import, Settings, and the add/edit dialog
tests/         Vitest: parser layouts, CSV/OFX/QIF, domain logic
tools/         check-statements.ts (real files), build_excel_pilot.py
legacy/        the original single-file HTML version, kept for reference
```

## Bank logos

`src/assets/banks/` holds the logos shown on the Import and welcome screens (`src/ui/BankLogos.tsx`,
which also marks which banks were checked against real statements). They were taken from the
banks' Wikipedia articles. The logos are trademarks of their banks and are shown only to say which
statements the app can read; check each bank's brand guidelines before publishing the app widely.

## Adding a bank

Most banks need nothing: add the bank to `SA_BANKS` in `src/parser/banks.ts` (legal-name and
domain markers, so a payment that mentions the bank does not change detection) and the generic
parser reads its table. Run `npm run check-statements -- statement.pdf` on a few real statements
and check that they reconcile. Add a fixture to `tests/fixtures.ts` for any new layout trait,
and its logo to `src/assets/banks/` and `BANKS` in `src/ui/BankLogos.tsx`.

Only if the generic parser cannot read a layout, write a parser in `src/parser/specific.ts`
returning a `ParseResult` and register it in `SPECIFIC` in `src/parser/statement.ts`.
