# Shop Operating System — Deep Investigation Brief for Claude Code

> **How to use this file**
> 1. Put this file in the root of your repo (e.g. `INVESTIGATION_PROMPT.md`).
> 2. Open the project in VS Code with Claude Code.
> 3. Paste the **"Kickoff message"** at the very bottom into Claude Code.
> 4. Claude Code will read this brief, investigate the whole repo, and write a report to `/_audit/FINDINGS.md`.
>
> This is an **investigation**, not a rewrite. The goal is a clear, evidence-backed diagnosis first. Fixes come in a separate step once you've read the findings.

---

## 1. Context (read this before doing anything)

You are auditing a **point-of-sale / shop management desktop application** with this stack:

- **Electron** (desktop shell: a `main` process + one or more `renderer` windows)
- **React** (the UI, running in the renderer)
- **Node.js** (business logic, file/hardware access, in the main process)
- **SQLite** (local database — the single source of truth for products, sales, stock, etc.)
- **Bluetooth thermal printer** integration (receipt printing)

**Critical facts that shape your priorities:**

- This app is **live in a real shop right now** (the developer's friend runs his business on it). Real money and real inventory depend on it. Treat data integrity and correctness as high stakes.
- The **number one complaint is that the app is SLOW.** This is the top priority of the whole audit.
- There are also **bugs, technical errors, and suspected logical errors** the owner wants found.
- The end goal is to take this from a **custom one-shop app** to an **industry-grade product that can be sold to any business.** So also assess what's missing for that.
- There is a **"resource" folder with a large number of files** — map it early and explain what it contains; large asset/resource folders are a common cause of slow startup and bloated installers.

---

## 2. Ground rules (important)

1. **Do NOT modify application code during this investigation.** This is read-only analysis. The only files you create are inside a new `/_audit/` folder.
2. **Never touch, open for writing, or run migrations against the live/production SQLite database.** If you need to test queries, copy the DB to `/_audit/sample.db` first, or work against a schema dump only.
3. **Don't run destructive commands.** No `npm run build` that overwrites dist, no deleting files, no `git` resets.
4. If you're unsure whether something is a bug or intended behaviour, **flag it as a question** rather than assuming.
5. Every finding must have **evidence**: a `file:line` reference and a short quote of the actual code. No vague claims.

---

## 3. Phase 0 — Map the system (do this first)

Before judging anything, build an accurate picture. Produce:

- A **tree of the repo** (top 3 levels), noting what each major folder is for.
- The **tech inventory**: read `package.json` (all of them if it's a monorepo) and list Electron version, React version, build tool (Webpack/Vite/electron-builder/forge), the SQLite driver (`better-sqlite3`? `sqlite3`? `sql.js`? an ORM like Prisma/Knex/TypeORM?), and any state library (Redux/Zustand/Context).
- The **process split**: which code runs in the Electron **main** process vs the **renderer**, and how they talk (`ipcMain`/`ipcRenderer`, `contextBridge`, `preload.js`).
- The **database schema**: find the SQL that creates tables (or the ORM models). List every table, its columns, and **which columns have indexes**.
- The **"resource" folder report**: how many files, total size, what types (images? fonts? native binaries? bundled data?), and whether they're loaded at startup or on demand.
- A one-paragraph plain-English description of **how a single sale flows through the app**, from clicking "add item" to the receipt printing. This reveals the hot path everything else hangs off.

Write this as `/_audit/00-system-map.md`.

---

## 4. Phase 1 — Performance (TOP PRIORITY: "it's too slow")

The owner feels the app is slow. Your job is to find *where* and *why*, with evidence. Investigate each of these and report concrete findings:

### 4.1 Database (the most likely culprit for a SQLite POS app)
- **Missing indexes**: For every query that filters/sorts/joins (especially product search, sales history, stock lookups), check whether the columns used in `WHERE`, `ORDER BY`, and `JOIN` have indexes. A product search over thousands of rows with no index is the classic cause of lag.
- **`SELECT *` and over-fetching**: queries pulling all columns or all rows when only a few are needed.
- **N+1 queries**: a loop that runs one query per item instead of one query for all items (e.g. rendering a sales list and querying each sale's lines separately).
- **No pagination**: loading the entire sales history / product list into memory at once.
- **Synchronous queries blocking the UI**: if using `better-sqlite3` (synchronous) in the renderer or on the main thread during user interaction, long queries freeze the app. Check where heavy queries run.
- **Missing transactions on bulk writes**: inserting many rows one-by-one without wrapping in a single transaction is extremely slow in SQLite (each insert = its own disk sync).
- **PRAGMA settings**: check whether `journal_mode=WAL`, `synchronous`, and `foreign_keys` are set. WAL mode alone often dramatically improves responsiveness.

### 4.2 React / renderer
- **Unnecessary re-renders**: large components re-rendering on every keystroke or state change; missing `React.memo`, `useMemo`, `useCallback`; context values that change identity every render.
- **Long lists without virtualization**: rendering hundreds/thousands of DOM rows (product grid, sales table) without `react-window`/`react-virtualized`.
- **Heavy work on the main thread**: big computations, sorting, or filtering done synchronously in render.
- **Large bundle / slow first paint**: check the build output size and whether everything is bundled into one chunk.

### 4.3 Electron / startup
- **What happens on app launch**: is the whole database read into memory? Are all those resource-folder files loaded eagerly? Is there a splash while heavy init runs?
- **IPC chattiness**: too many small round-trips between renderer and main for one action.
- **Window/webContents settings** that hurt performance.

### 4.4 Deliverable
Write `/_audit/01-performance.md` ranking findings by **impact** (how much speed it likely costs) and **effort** (how hard to fix). Call out the **top 3 changes that would make the biggest difference** — these are what the owner should do first.

---

## 5. Phase 2 — Correctness & logic errors (money and stock must be right)

For a shop system, a logic bug can mean lost money or wrong inventory. Hunt specifically for:

- **Money handled as floating point**: `0.1 + 0.2` problems. Prices, totals, tax, discounts, and change should use integer cents or a decimal library — never raw JS floats. This is the #1 POS correctness bug. Report every place money is calculated.
- **Tax / discount / total math**: rounding direction, order of operations (discount before or after tax?), per-line vs whole-cart rounding.
- **Stock/inventory updates**: does stock decrement correctly on a sale, and increment on a return/void? Any path where a sale can succeed but stock not update (or vice versa)?
- **Transaction atomicity**: is "record the sale" + "reduce stock" + "print receipt" wrapped so a failure can't leave the DB half-updated (sale recorded but stock untouched, or money taken but no sale saved)?
- **Concurrency / double-submit**: can clicking "Pay" twice create two sales? Any race conditions?
- **Returns, voids, refunds, held carts**: check the edge cases, not just the happy path.
- **Date/time & timezone**: are sales timestamped consistently? Do daily reports use local day boundaries correctly?
- **Null/empty/negative inputs**: quantity 0, negative price, empty cart, barcode not found.

Write `/_audit/02-correctness.md`. For each logic bug: the scenario that triggers it, the wrong result, and the file:line.

---

## 6. Phase 3 — Stability, errors & the printer

- **Unhandled errors**: missing `try/catch` around DB calls, file I/O, and IPC; unhandled promise rejections; errors that crash the renderer or silently swallow failures.
- **The Bluetooth thermal printer**: this is a known fragile area. Check what happens when the printer is off, out of paper, disconnected, or slow. Does a failed print block or crash the sale? Is the sale saved *before* printing is attempted (it should be)?
- **Crash paths**: anything that can throw during a sale and take down the window.
- **Error surfacing**: are errors shown to the cashier usefully, or do they just freeze/vanish?
- **Logging**: is there any log file to diagnose issues in the field? (Needed badly for a product you sell.)

Write `/_audit/03-stability.md`.

---

## 7. Phase 4 — Security & data safety

- **SQL injection**: any query built by string concatenation instead of parameterized queries/prepared statements.
- **Electron hardening**: check `nodeIntegration` (should be off), `contextIsolation` (should be on), `webSecurity`, and whether the renderer has raw Node access. A POS app with `nodeIntegration: true` is a real risk.
- **Secrets**: any API keys, passwords, or licence secrets hardcoded in the source.
- **Backups**: is the SQLite DB ever backed up? What happens if the file corrupts? (For a live shop this is existential.)
- **Auth / roles**: is there any cashier-vs-admin separation, or can anyone do anything?

Write `/_audit/04-security.md`.

---

## 8. Phase 5 — Industry-readiness audit (from custom app → sellable product)

The owner wants to sell this to any business. Assess the gap honestly. For each area, say **current state** and **what's needed**:

- **Configurability**: is anything hardcoded for this one shop (shop name, tax rate, currency, receipt layout, product categories)? List every hardcoded assumption. A sellable product needs these as settings.
- **Multi-business / multi-tenant**: can it be installed cleanly for a different shop with its own data? Is there a setup/onboarding flow?
- **Licensing / activation**: is there any way to license or protect it? (Needed to actually sell it.)
- **Installer & updates**: is there a proper installer (electron-builder/NSIS)? Is there **auto-update**? Without updates you can't ship fixes to customers.
- **Data migration**: when the schema changes between versions, is there a migration system so existing customers don't lose data?
- **Testing**: are there any automated tests? What's the coverage of the money/stock logic? (Selling software with zero tests on the money path is a liability.)
- **Logging & diagnostics**: can you debug a customer's problem remotely from logs?
- **Documentation**: is there a README, setup guide, or user manual?
- **Branding/white-label**: can the look and receipt be rebranded per customer?
- **Code quality for maintenance**: TypeScript or plain JS? Consistent structure? Dead code? Anything that makes it hard to maintain across many customers.

Write `/_audit/05-industry-readiness.md` with a simple **readiness scorecard** (e.g. each area rated Not started / Partial / Ready) and a prioritized list of what to build to reach v1.0 sellable.

---

## 9. Final deliverable — the summary report

After all phases, write `/_audit/FINDINGS.md` as the top-level report an owner can read in 10 minutes:

1. **Executive summary** (one paragraph): overall health, and the single most important thing to fix.
2. **Why it's slow** — the real root causes, top 3, in plain language.
3. **Top 10 issues overall**, as a table: `# | Area | Issue | Severity (Critical/High/Med/Low) | Impact | Effort | File:line`.
4. **Critical risks** — anything that could lose money or data in the live shop (fix these first, carefully).
5. **Quick wins** — high impact, low effort changes (do this week).
6. **Road to industry-level** — the ordered list of bigger work to make it sellable, grouped into phases.
7. Links to the detailed phase files.

Rank everything by **severity first, then effort**. Be direct and specific — the owner would rather hear "money is stored as a float in `cart.js:88`, this will cause wrong totals" than "consider reviewing numeric handling."

---

## 10. Kickoff message (paste this into Claude Code)

```
Read INVESTIGATION_PROMPT.md in the repo root and follow it exactly.

This is a read-only investigation of a live Electron + React + Node + SQLite
point-of-sale app. Do not modify any application code or touch the production
database. Create a /_audit/ folder and work through Phase 0 to Phase 5 in order,
writing each phase's markdown file, then produce /_audit/FINDINGS.md as the final
summary.

Start with Phase 0: map the repo, read all package.json files, find the SQLite
schema and its indexes, map the Electron main-vs-renderer split, and report what's
in the large resource folder. Show me /_audit/00-system-map.md before moving on to
Phase 1 (performance), which is the top priority because the app is too slow.
```
