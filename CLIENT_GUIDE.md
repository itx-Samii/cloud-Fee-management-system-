# Fee Management System — Installing at a School

## Before you send anything

The app stores everything in a Supabase (PostgreSQL) database, so it needs an internet connection and the database's connection string.

- **Several schools?** Prefer hosting the app once on a server and giving each school its own principal login from the Super Admin panel. Schools then only need a browser.
- **Installing on a school's own PC?** Give that school a Supabase project of its own. Never copy your own `.env.local` to a client: whoever has that file has full access to the database.
- **Getting the connection string.** In the Supabase project click **Connect**, copy the **Session pooler** string and put the database password in place of `[YOUR-PASSWORD]`. If the password has symbols such as `@ # / ?`, reset it in Supabase (Project Settings → Database) to letters and numbers.
- **Plan.** Supabase's free plan pauses a project nobody has used for a while (a long holiday, say) and keeps no backups. For a school in daily use, take the Pro plan, and download a backup from the Dashboard every week anyway.
- **Already using the MongoDB version?** Move the data across once with `npm run db:import` before switching (see README, "Moving from the MongoDB version").

## 1. Prepare the ZIP

From the project folder, delete `.next`, `node_modules` and `.env.local` (if present), then zip the folder as `Fee_Management_Setup.zip`.

## 2. Steps for the school

1. **Extract** — right-click the ZIP, choose **Extract All**, and move the folder somewhere permanent (Desktop or Documents).
2. **Install** — double-click `INSTALL_ERP.bat`.
   - If Node.js is missing it downloads and installs it, then asks you to run the installer again.
   - The first time, Notepad opens a settings file (`.env.local`). Paste the Supabase connection string into `DATABASE_URL`, save, close Notepad and run the installer again.
   - Wait for **INSTALLATION SUCCESSFUL**.
3. **Start** — double-click the **Fee Management System** icon on the Desktop. The browser opens the login page.

## 3. First login

Sign in as `admin` / `brookfield` and change the password straight away from the Dashboard (**Change Admin Password**). Then add accountant logins under **Users & Roles**.

## 4. Daily use

- **Receiving fees.** Every payment prints with its own receipt number. If a parent pays in instalments, each instalment gets a separate receipt. Earlier unpaid months appear on the screen and the challan, and a payment clears the oldest month first.
- **Late fine.** The principal sets the due days and the fine once, under **Challan Config**. After the due date the fine is added automatically at the counter; tick "Waive late fine" to let it go (the principal sees this in the Activity Log).
- **Defaulters.** **Defaulter List** shows everyone whose bills are past the due date, with how many months and how much. Print it or export it for calls to parents. **Ledger** on any student shows their full history to print for a parent.
- **Parents on WhatsApp.** Add the parent's mobile number to each student (it can also be a column in the import file). Then use the green **WhatsApp** buttons: on the Defaulter List and Student Ledger for reminders, and after a payment to send the receipt. WhatsApp opens with the message written; check it and press send. Brothers and sisters with the same number show together on the ledger, and one reminder covers them all.
- **Salary slips.** On **Salaries Manager**, every paid salary has a **Slip** button to print for the employee.
- **New school, many students.** Under **All Students**, download the **Template**, fill it in Excel, save as CSV and use **Import from Excel (CSV)**.
- **Student leaves.** **All Students → Modify → Enrolment: Left the school**. Their vouchers stop; their record and any balance stay.
- **End of the day.** Open **Daily Cash Book**: it lists every receipt issued today and how much cash each cashier should hand over. Print it or export it to Excel (CSV) for the day's file.
- **Mistakes.** An accountant can delete a voucher that nobody has paid on. If money was already taken, only the principal can reverse it. The receipt stays in the Cash Book, crossed out and marked "Reversed".
- **Checking who did what.** Principals can open **Activity Log** to see every payment, reversal, fee or discount change, deletion, salary, expense and login, with the person and the time. Nobody can edit or delete it.
