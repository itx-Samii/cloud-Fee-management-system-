# School Pay — Fee Management System

A fee billing and accounting app for schools: monthly fee vouchers with arrears and late fines, payment collection with numbered receipts, a daily cash book, a defaulter list, student ledgers, class-wise tracking, annual-charges ledger, expenses, staff salaries, reports, spreadsheet import of students, WhatsApp reminders and receipts, family views, salary slips, an activity log, and user roles. One installation can serve several schools (each school only ever sees its own data), managed from a Super Admin panel.

Built with Next.js 16 (App Router), React 19 and PostgreSQL on Supabase.

## Requirements

- Node.js 20.9 or newer (24 LTS recommended)
- A Supabase project (or any PostgreSQL 15+ server)

## Setup

1. Create a project at [supabase.com](https://supabase.com). Pick the region nearest the school (South Asia, Mumbai, for Pakistan) and note the database password.
2. In the project, click **Connect** and copy the **Session pooler** connection string (on Vercel or other serverless hosting, the **Transaction pooler** one). Put the database password in place of `[YOUR-PASSWORD]`.
3. Then:

```bash
npm ci
cp .env.example .env.local   # put the connection string in DATABASE_URL (and set SESSION_SECRET, SUPERADMIN_PASSWORD)
npm run dev                  # http://localhost:3001
```

The app creates its tables the first time it connects; there is nothing to run in Supabase's SQL editor. For production: `npm run build` then `npm start` (also on port 3001).

### Settings (`.env.local`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (Supabase pooler) |
| `SESSION_SECRET` | recommended | Signs login cookies. Falls back to a key derived from `DATABASE_URL` |
| `SUPERADMIN_PASSWORD` | for first Super Admin login | Used only until the Super Admin password is first saved |
| `LICENSE_KEY` | no | Key for the default Brook Field client record |

## Logins and roles

| Role | How to sign in | Can do |
|---|---|---|
| Super Admin | `superadmin` + `SUPERADMIN_PASSWORD` (first time) | Create schools, set licenses and limits, block or unblock schools, switch features on or off per school |
| Principal (admin) | `admin` / `brookfield` on a fresh install, or the username the Super Admin set for the school | Everything inside their own school, including reversing payments and reading the Activity Log |
| Accountant | Created by the principal under **Users & Roles** | Receive payments, Daily Cash Book, generate vouchers, class-wise tracking, expenses |

Change the default `admin` / `brookfield` password from the Dashboard straight after the first login. Passwords must be at least 8 characters.

### Features per school

The Super Admin's **🧩 Features** button switches each part of the app on or off for one school (the list lives in `lib/features.ts`):

- **Modules:** Receive Payment, Daily Cash Book, Generate Vouchers, Class-wise Tracking, Defaulter List, Student Ledger, Financial Reports, Expense Manager, AC Ledger, Salaries, Classes, All Students, Users & Roles, Activity Log.
- **Fee options:** Extra Charges, Advance Fee, Late Fine.
- **Tools:** WhatsApp Messages, Import from Excel.

A switched-off feature is locked in the school's menu, its buttons are hidden, its pages show a "switched off" screen, and the server refuses its actions, so typing a page address or calling the API directly doesn't get round it. Some features need another: Daily Cash Book and Advance Fee need Receive Payment, and Import needs All Students.

What is already recorded stays as it is. With Late Fine off no new fines are charged, but fines already charged remain. With Extra Charges off new vouchers bill the fee alone, but charges already on vouchers remain. The Activity Log keeps recording while its page is off. Features added in later versions start switched on.

## Fees, arrears and fines

- **Arrears carry forward.** A voucher always shows what the student still owes from earlier months, worked out fresh each time it is opened or printed. Each month's voucher keeps its own record; nothing is copied or closed.
- **Oldest month first.** A payment clears the earliest unpaid month first, then the next, and whatever is left goes to the voucher being paid. The receipt lists how much went to each month.
- **Late fine.** The principal sets "due after (days)" and "late fine" under Challan Config (Generate Vouchers or Class-wise Tracking). Each new voucher gets a due date; if it is paid after that date the fine is added once, at the counter. The cashier can waive it, and the waiver goes in the Activity Log. Vouchers made before this version have no due date and are never fined. The fine starts at Rs. 0 (off) until the principal sets it.
- **Extra charges.** Anything billed on top of the monthly fee (admission fee, exam fee, sports...) is a named charge on a voucher: it adds to that month's bill, so it counts in arrears, late fines, the defaulter list and reports, and prints on the challan and receipt. Add them per voucher (Generate Vouchers → Charges, or at the counter), or one charge for every voucher in the list at once (Generate Vouchers → "+ Charge for all shown", e.g. a class's exam fee; a voucher that already has a charge by that name is skipped, so a second click doesn't bill twice). Charges that recur every month, such as transport, are set on the student (All Students → Modify) and go onto each new voucher; changing them also updates that student's unpaid vouchers. A charge can't be removed once it would leave a voucher billing less than was paid on it.
- **Advance fee.** When a family pays more than everything owed, the cashier ticks "advance fee" and the extra pays the coming months: their vouchers are made there and then (up to 12 months ahead) and marked paid, so they show as paid on every screen and the month's normal generation skips them. Without the tick the payment is refused, so a typing slip can't turn into months of vouchers. Reversing that receipt takes it all back, and removes the months paid ahead that haven't come yet.
- **Students who leave.** Mark a student "Left the school" (All Students → Modify). They stop getting monthly vouchers and no longer count in class sizes or the license limit; their history and any balance stay.
- **Defaulter list.** Everyone with bills past their due date, biggest balance first, with months unpaid, the oldest unpaid month, fines and annual charges. Filter by class or by months unpaid; print or export.
- **Student ledger.** One page per student with every voucher, every receipt (reversed ones crossed out) and the balance due now; printable as a statement for parents.
- **WhatsApp.** With a parent phone on the student, the Defaulter List and Student Ledger have a WhatsApp button that opens a ready-written reminder, and the collection screen can send the receipt. These are WhatsApp "click to chat" links: the message opens in WhatsApp on the staff member's phone or computer to check and send. No paid service, nothing sent automatically.
- **Families.** Students with the same parent phone (however it is written, 0300-… or +92 300 …) are treated as one family: the ledger lists brothers and sisters with what each owes, and the reminder covers them all.
- **Salary slips.** Every paid salary has a printable slip (gross, days off, deduction, net, date).
- **Import from Excel.** On All Students, save the sheet as CSV and import it (a template is provided). Every row is checked first; if any row is wrong, nothing is imported and the problem rows are listed, so the corrected file can simply be imported again. A blank fee takes the class's fee.

## Money trail

Every rupee can be traced to a person and a time:

- **Receipts.** Each payment gets its own receipt number (per school, never reused) with the amount, time and the cashier who took it, even when a voucher is paid in instalments. The **Daily Cash Book** lists a day's receipts and how much each cashier should hand over.
- **Reversals.** The principal can reverse a receipt from the Cash Book: everything it paid (on every month it reached), the annual charges and any fine it charged are undone, and it stays on file marked "reversed". Reversing a voucher reverses every receipt that touched it. Accountants can only delete vouchers nobody has paid on.
- **One voucher per student per month.** The database refuses a second one, so two people generating at the same moment (or a double click) can't bill twice.
- **All or nothing.** Taking a payment, reversing a receipt or a voucher, and restoring a backup each run in one database transaction holding a lock on the student, so two cashiers serving the same family take turns, and a failure part-way leaves nothing half-saved.
- **Nothing silently disappears.** Deleting a student keeps their paid vouchers, and removing a staff member keeps the salaries already paid, so past income and expenses don't change.
- **Activity Log.** Payments, reversals, fee and discount edits, deletions, salary payments, expenses, logins, password changes, backups and restores are recorded with who did it and when. Nobody can edit or delete the log from the app, and restoring a backup doesn't touch it.

Receipts start with this version; payments taken before it are still in the vouchers but have no receipt rows.

## How it is organised

```
app/            pages (one folder per screen) and app/api/* route handlers
lib/auth.ts     requireSession(): every API route checks login, role and license here
lib/session.ts  signed login cookie (shared with proxy.ts)
lib/db.ts       Postgres connection pool, transactions, creating the tables
lib/schema.ts   the tables (SQL)
lib/dbHandler.ts  per-school record helpers, column types, password hashing, usernames
lib/fees.ts     fee arithmetic shared by pages and API: arrears, late fines, balances
lib/ledger.ts   taking payments (oldest month first), fines, reversing receipts
lib/csv.ts      reading Excel CSV files (student import)
lib/whatsapp.ts WhatsApp links and message wording
lib/audit.ts    Activity Log writer
lib/license.ts  license and feature lookup
proxy.ts        page redirects (login, role-restricted pages)
scripts/import-old-data.ts  one-time copy of the old MongoDB data into Postgres
tests/          automated tests (unit + API, against a real Postgres)
```

All schools share the same tables; every row carries a `school_id` and every query is scoped to the signed-in user's school. Ids (student, voucher, receipt numbers) count up separately for each school. Row Level Security is switched on for every table with no policies, so Supabase's public API can't read anything; the app connects as the database owner and isn't affected. Data can be browsed in Supabase's Table Editor (column names are snake_case: `students.monthly_fee`, `fees.paid_tuition`, ...).

## Testing

```bash
npm test            # unit and API tests; starts its own throwaway Postgres, no setup needed
npm run check       # lint + type check + tests, what CI runs before the build
```

The API tests call the real route handlers against a throwaway database and cover logins and lockout, roles, school separation, payments and receipts (including simultaneous payments), arrears, late fines and waivers, reversals, students leaving, the defaulter list, families, WhatsApp links, spreadsheet import, simultaneous voucher generation, backups (including old MongoDB-era backup files, and a restore failing part-way), Super Admin school management and the activity log. Set `TEST_DATABASE_URL` to use an existing Postgres server instead of the bundled one (CI does this).

`.github/workflows/ci.yml` runs lint, type check, tests and a production build on every push once the code is on GitHub.

## Running in production

- Set `SESSION_SECRET` to a long random value, and change the default `admin` / `brookfield` password at once.
- `GET /api/health` answers `{"status":"ok"}` when the app is up and can reach the database (503 otherwise), for uptime monitors.
- Pages are sent with headers that stop other sites framing them, and the login cookie is `httpOnly`, `SameSite=Lax` and `Secure` in production. Serve the app over HTTPS when it is reachable from outside the school.
- Take a backup from the Dashboard regularly. Supabase's free plan pauses a project that goes unused for a while and has no automatic backups; for a school in daily use, the Pro plan (daily backups) is the safer choice.

## Windows desktop install

`INSTALL_ERP.bat` installs Node.js if needed, asks for the database settings, builds the app and adds a Desktop shortcut; `RUN_ERP.bat` (or the shortcut) starts it. See [CLIENT_GUIDE.md](CLIENT_GUIDE.md).

## Moving from the MongoDB version

`npm run db:import` copies everything (all schools, students, vouchers, receipts, staff, salaries, expenses, logins, licenses, settings, the activity log) from the old MongoDB database into the database in `DATABASE_URL`. Run it once, from a full `npm install`, before the school starts using the new version:

```bash
npm run db:import -- --mongo "mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/fee_management" --dry-run
npm run db:import -- --mongo "mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/fee_management"
```

`--dry-run` checks everything and prints the counts without saving. The import goes in one transaction (all or nothing), refuses a database that already has data unless given `--replace`, and only reads from MongoDB. `--folder <path>` reads the JSON files of the original single-school version instead. Backup files downloaded from the MongoDB version can also be restored into the new one from the Dashboard.

## Backups

Principals can download a backup file and restore it from the Dashboard. A backup contains only that school's data (receipts included) and can only be restored into the same school. Login passwords are never part of a backup, and restoring leaves them unchanged.
