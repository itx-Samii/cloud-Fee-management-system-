# School Pay — Fee Management System

A fee billing and accounting app for schools: monthly fee vouchers with arrears and late fines, payment collection with numbered receipts, a daily cash book, a defaulter list, student ledgers, class-wise tracking, class promotion for the new session, annual-charges ledger, expenses, staff salaries, reports, spreadsheet import of students, WhatsApp reminders and receipts, family views, salary slips, an activity log, and user roles. One installation can serve several schools (each school only ever sees its own data), managed from a Super Admin panel.

Built with Next.js 16 (App Router), React 19 and PostgreSQL. The Windows launcher runs the database locally; no cloud account is needed.

## Offline setup (recommended)

Requires Node.js 20.9+ and Windows. Internet is needed for the initial dependency install only.

```bash
npm ci
npm run offline:setup
npm run build
npm run offline
```

Open http://localhost:3001. `RUN_ERP.bat` starts the same offline launcher. For development use `npm run offline:dev` instead of build/start.

The public overview is at `/home`. Staff, Super Admin and parents sign in at `/login`. Enter a staff username and password or a parent phone number and School PIN. School Pay verifies the credentials and opens the matching workspace. If a parent PIN matches two schools, select the school. Old sign-in links redirect to `/login`.

The workspace shares the public glass palette. On desktop, use the sidebar to switch views or choose a theme. On smaller screens, use the theme switch or open the workspace menu. Fee documents still print with their paper styles. See `DESIGN.md` for the shared design and token ownership.

The dashboard compares recorded collections and expenses by day in **Monthly view** and by month in **Lifetime audit**. Select a bar group for exact PKR totals. The collections breakdown shows tuition and annual charges. Legacy collections without dated receipts can appear in lifetime totals and the breakdown. The timeline uses dated entries only.

In the Parent Portal, each student card highlights their latest issued voucher with a balance. Select **Refresh fees** to check for newly issued vouchers, then **Print challan** to preview the document. **Print / Save PDF** opens the browser print window with just the selected challan. Earlier vouchers and receipts remain available below each student’s current fee.

**Generate Vouchers** and the **Parent Portal** print the same issued challan on A4 landscape, with Bank Copy, Student Copy and Information. A principal can set the logo, school address, bank account and payment instructions in **Generate Vouchers → Challan Config → Save shared challan settings**. Use **Load previous browser settings** from the original staff browser to review and save earlier branding. Until the school configures bank details, challans direct families to the school office for payment instructions.

In the **Student Ledger**, use **Show PIN** or **Hide PIN** in the **Parent portal** card. Viewing a PIN is recorded in the school's Activity Log. Previously issued PINs still work for parent sign-in. To make an older PIN viewable in the ledger, issue a **New PIN** once and share it with the family. Keep the existing `SESSION_SECRET` (or `DATABASE_URL` if it supplies the key) to retain access to encrypted PINs.

### School account requests

On **Sign in**, select **Sign up** to request a new school account. Enter the school and principal’s contact details and choose the username and password the principal will use after approval. The request is stored on this installation.

Sign in at `/login` using `superadmin` and its existing password. On **Client licenses**, open **Signup requests** and select **Refresh requests** to see new submissions. Approving a request creates the school and its active license so the principal can sign in. Rejecting a request leaves the applicant free to submit a new one. Parent accounts continue to use the PIN issued by their school.

### Demo trials

In **Super Admin → Client licenses**, select **Trial / Demo** when issuing a license or modifying a regular school. Enter 1–365 trial days. The trial begins when saved, with each day counted as 24 hours. **Extend or restart trial** adds days to the current deadline or starts a new trial when expired. **Switch to regular license** clears the trial deadline. Manually suspended licenses require activation as well.

School staff see a **Trial** banner with the expiry time in PKT. In-app reminders start when 7 days remain and become more prominent at 3 days and 1 day. At expiry, school sign-ins and protected requests are blocked, including the Parent Portal. School records remain available once access is restored.

The launcher starts PostgreSQL on `127.0.0.1:54329`, then starts the app on loopback port 3001. It refuses cloud database URLs. If the local database is already running and authenticates successfully, it reuses it without stopping someone else's server. Otherwise it starts its own persistent database and stops it when the app exits. Keep the launcher running while using the app.

Data persists in `.local-postgres/` across restarts. Keep `.env.local` with its original database password and back up school data from the Dashboard to another drive. Setup never replaces existing settings or an existing database. Core records, payments, receipts, reports and printing work without internet. WhatsApp needs internet; parents cannot reach a loopback-only installation from another device. This is a local server, not a browser-only app or a multi-device offline-sync system.

Existing cloud data is not copied or deleted automatically. A local installation shows only its local data. The optional cloud deployment still supports an explicitly configured `DATABASE_URL` via `npm run dev` / `npm start`; it is not used by the offline launcher.

### Reliability protections

- Blocking, deleting or renaming a staff account, changing its role, or resetting its password invalidates existing sessions. Principal and Super Admin password changes also revoke previous sessions. Sessions issued before this upgrade require a new login.
- Payment requests require a unique `requestId` (16–100 letters, digits, hyphens or underscores). The collection screen retains this ID in browser session storage through an uncertain response or page reload. Retry with the same details to retrieve the original receipt; changing details under an existing ID is refused. Receipts retain IDs in school backups. A different intentional payment needs a fresh ID.
- Student and unpaid-voucher edits share the payment lock and one transaction. Stale forms are rejected; reductions below already received tuition are refused. Annual-charge paid balances change through receipts/reversals rather than direct edits.
- Payment receipt/reversal and student-edit audit records are saved in the same transaction. If the audit insert fails, the financial change rolls back.
- Monthly dashboard collections use non-reversed receipt dates. Historical amounts without receipts appear in lifetime totals with a notice, not in monthly totals. Failed loading shows Retry instead of zero accounts.

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
| Super Admin | `superadmin` + `    ` (first time) | Create schools, set licenses and limits, block or unblock schools, switch features on or off per school |
| Principal (admin) | `admin` / `brookfield` on a fresh install, or the username the Super Admin set for the school | Everything inside their own school, including reversing payments and reading the Activity Log |
| Accountant | Created by the principal under **Users & Roles** | Receive payments, Daily Cash Book, generate vouchers, class-wise tracking, expenses |
| Parent | Phone number + the PIN the school gave them, at `/login` | See their own children's vouchers, receipts and balance; print a challan. Nothing else |

Change the default `admin` / `brookfield` password from the Dashboard straight after the first login. Passwords must be at least 8 characters.

### Features per school

The Super Admin's **🧩 Features** button switches each part of the app on or off for one school (the list lives in `lib/features.ts`):

- **Modules:** Receive Payment, Daily Cash Book, Generate Vouchers, Class-wise Tracking, Defaulter List, Student Ledger, Financial Reports, Expense Manager, AC Ledger, Salaries, Classes, All Students, Class Promotion, Users & Roles, Activity Log.
- **Fee options:** Extra Charges, Advance Fee, Late Fine.
- **Tools:** WhatsApp Messages, Bulk Reminders, Parent Portal, Import from Excel.

A switched-off feature is locked in the school's menu, its buttons are hidden, its pages show a "switched off" screen, and the server refuses its actions, so typing a page address or calling the API directly doesn't get round it. Some features need another: Daily Cash Book and Advance Fee need Receive Payment, Import and Class Promotion need All Students, and Bulk Reminders needs WhatsApp Messages.

What is already recorded stays as it is. With Late Fine off no new fines are charged, but fines already charged remain. With Extra Charges off new vouchers bill the fee alone, but charges already on vouchers remain. The Activity Log keeps recording while its page is off. Features added in later versions start switched on.

## Fees, arrears and fines

- **Arrears carry forward.** A voucher always shows what the student still owes from earlier months, worked out fresh each time it is opened or printed. Each month's voucher keeps its own record; nothing is copied or closed.
- **Oldest month first.** A payment clears the earliest unpaid month first, then the next, and whatever is left goes to the voucher being paid. The receipt lists how much went to each month.
- **Late fine.** The principal sets "due after (days)" and "late fine" under Challan Config (Generate Vouchers or Class-wise Tracking). Each new voucher gets a due date; if it is paid after that date the fine is added once, at the counter. The cashier can waive it, and the waiver goes in the Activity Log. Vouchers made before this version have no due date and are never fined. The fine starts at Rs. 0 (off) until the principal sets it.
- **Extra charges.** Anything billed on top of the monthly fee (admission fee, exam fee, sports...) is a named charge on a voucher: it adds to that month's bill, so it counts in arrears, late fines, the defaulter list and reports, and prints on the challan and receipt. Add them per voucher (Generate Vouchers → Charges, or at the counter), or one charge for every voucher in the list at once (Generate Vouchers → "+ Charge for all shown", e.g. a class's exam fee; a voucher that already has a charge by that name is skipped, so a second click doesn't bill twice). Charges that recur every month, such as transport, are set on the student (All Students → Modify) and go onto each new voucher; changing them also updates that student's unpaid vouchers. A charge can't be removed once it would leave a voucher billing less than was paid on it.
- **Advance fee.** When a family pays more than everything owed, the cashier ticks "advance fee" and the extra pays the coming months: their vouchers are made there and then (up to 12 months ahead) and marked paid, so they show as paid on every screen and the month's normal generation skips them. Without the tick the payment is refused, so a typing slip can't turn into months of vouchers. Reversing that receipt takes it all back, and removes the months paid ahead that haven't come yet.
- **Students who leave.** Mark a student "Left the school" (All Students → Modify). They stop getting monthly vouchers and no longer count in class sizes or the license limit; their history and any balance stay.
- **Class promotion.** At the start of a new session the principal moves every class up at once (Classes → Promote Students). Each class's next class is suggested from its name (5th A → 6th A, Pre 9th → 9th) and can be changed; the top class can be marked as passed out (Left). Fees can stay as they are, rise by an amount or a percentage, or take the new class's fee, and annual charges for the new year can be added. Students who failed are unticked to stay where they are. Everyone moves together, one class at a time at most, even when two people press the button at once. The latest promotion can be undone: each student's class, fee, annual charges and status go back, except anything edited since. Vouchers already made keep their old class and fee, so promote before generating the new session's first vouchers.
- **Defaulter list.** Everyone with bills past their due date, biggest balance first, with months unpaid, the oldest unpaid month, fines and annual charges. Filter by class or by months unpaid; print or export.
- **Student ledger.** One page per student with every voucher, every receipt (reversed ones crossed out) and the balance due now; printable as a statement for parents.
- **WhatsApp.** With a parent phone on the student, the Defaulter List and Student Ledger have a WhatsApp button that opens a ready-written reminder, and the collection screen can send the receipt. These are WhatsApp "click to chat" links: the message opens in WhatsApp on the staff member's phone or computer to check and send. No paid service, nothing sent automatically.
- **Bulk reminders.** "Remind all" on the Defaulter List goes through every family on the list (as filtered) one after another: each opens in WhatsApp with the message written, staff press Send there and come back for the next. Brothers and sisters get one message together; families reminded in the last few days can be left out (3 days unless changed), and students with no parent phone are listed so they can be called. Every reminder opened, from the queue, a Defaulter List row or a Student Ledger, is recorded with who opened it, and the Defaulter List shows "Reminded 2 days ago". Still click-to-chat: nothing goes out without someone pressing Send in WhatsApp.
- **Parent portal.** On a student's ledger the school gives the family (everyone on that parent phone) a 6-digit PIN, which staff can view and share. The parent signs in at `/login` with the phone number and PIN and sees each child's balance, vouchers (with a printable challan) and receipts. Access follows the phone numbers saved on the students. Ten wrong PINs lock the number for 15 minutes. A new PIN or closing the login ends the old sessions. PIN credentials are excluded from school backups. Parents on other devices need a reachable installation (see Running in production).
- **Families.** Students with the same parent phone (however it is written, 0300-… or +92 300 …) are treated as one family: the ledger lists brothers and sisters with what each owes, and the reminder covers them all.
- **Salary slips.** Every paid salary has a printable slip (gross, days off, deduction, net, date).
- **Import from Excel.** On All Students, save the sheet as CSV and import it (a template is provided). Every row is checked first; if any row is wrong, nothing is imported and the problem rows are listed, so the corrected file can simply be imported again. A blank fee takes the class's fee.
- **Admission and roll numbers.** New students get an admission number such as `ADM-00001` from the school's sequence. Existing admission numbers are kept, including numbers supplied for legacy students in a CSV import. On first launch after the update, missing numbers are filled in. Each class and section has its own roll sequence, starting at `1`. A student without a class receives a roll when assigned one. A transfer, promotion, or undo that changes the class assigns the next roll in the destination class. Roll numbers stay fixed while a student remains in that class. Removing a student leaves a gap, and later students keep their numbers. Class lists show students in roll order, and the All Students CSV includes both numbers.

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
lib/promotion.ts  class promotion and undoing it (rules shared with the page: lib/promotionPlan.ts)
lib/csv.ts      reading Excel CSV files (student import)
lib/whatsapp.ts WhatsApp links, message wording and grouping reminders by family
lib/reminders.ts  record of reminders sent
lib/parents.ts  parent portal: PINs, parent sign-in and what a family may see
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

The API tests call the real route handlers against a throwaway database and cover logins and lockout, roles, school separation, payments and receipts (including simultaneous payments), arrears, late fines and waivers, reversals, students leaving, the defaulter list, families, WhatsApp links and reminders, spreadsheet import, simultaneous voucher generation, class promotion and undoing it, backups (including old MongoDB-era backup files, and a restore failing part-way), Super Admin school management, the parent portal (who can see what, PIN lockout, ending old sign-ins) and the activity log. Set `TEST_DATABASE_URL` to use an existing Postgres server instead of the bundled one (CI does this).

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
