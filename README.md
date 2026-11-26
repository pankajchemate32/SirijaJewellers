# Sirija Jwellers — Bullion POS & Inventory

A simple web app to buy, stock, bill and report MMTC gold and silver coins and bars.
Every physical coin/bar is tracked by its certificate / serial number.

Screens: Dashboard · Sales / Billing · Purchases · Inventory · Customers · Suppliers · Reports · Settings

## Run it

Needs Node.js 20+ (or Bun).

```bash
npm install --legacy-peer-deps   # or: bun install
npm run dev                      # opens on http://localhost:3000
```

### Local Mode (no setup)

With no Supabase settings the app runs in **Local Mode**: data is kept in this browser
only and sample data is loaded. Sample logins:

| Role  | Email               | PIN  |
|-------|---------------------|------|
| Owner | owner@sirija.demo   | 1234 |
| Staff | billing@sirija.demo | 0000 |

### Online Mode (Supabase — recommended for real use)

1. Create a free project at supabase.com.
2. Open **SQL Editor**, paste the whole of `supabase/schema.sql`, and run it.
3. Copy `.env.example` to `.env.local` and fill in `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
4. Start the app, choose **Create a login**, then **Set up Sirija Jwellers**.
   The first person becomes the **Owner**.
5. Staff: the Owner adds their email in **Settings → Users**; staff then use
   **Create a login** with that email.

Moving from Local Mode: **Settings → Download Backup** in Local Mode, then
**Settings → Restore Backup** after signing in to Online Mode.

## Build for hosting

```bash
npm run build      # static files in dist/ — host on Netlify, Vercel, Cloudflare Pages, etc.
```

## How data is kept safe

- Each save (a bill, purchase, return, payment…) is written in **one database
  transaction** through `apply_changeset()`: all rows are saved or none are.
- The database itself refuses mistakes, even from two counters at once:
  a serial number can exist only once; a coin can never be sold twice; sold stock
  returns only through a recorded sales return; stock movement history can never be
  edited or deleted; saved bills keep their rates, tax and cost forever; completed
  purchases can only be paid or reversed.
- **Staff** cannot delete completed transactions, reverse purchases, adjust stock,
  change settings or manage users. Only draft purchases can be deleted.
- Gross margin uses the actual purchase cost of each sold serial, and is labelled
  gross margin, not net profit.

## Project layout

```
src/context/StoreContext.tsx   all business actions (sale, purchase, return…)
src/lib/cloud.ts               Supabase connection, load and save
src/lib/changeset.ts           works out which rows changed after an action
src/pages/                     the 8 screens
src/utils/excel.ts             MMTC stock import, product import, Excel export
src/utils/pdf.ts               A4 and thermal invoice PDFs, report PDFs
supabase/schema.sql            tables, rules, security (run once in Supabase)
```
