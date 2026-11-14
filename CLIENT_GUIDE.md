# Fee Management System — Installing at a School

## Before you send anything

The Windows installation stores school data on that computer in a local PostgreSQL database. Daily fee collection, reports and printing do not require internet. Initial installation and WhatsApp messaging do require internet.

## 1. Prepare the ZIP

Package source files only. Exclude `.env.local`, `.local-postgres`, `.next`, `.git` and `node_modules` from the ZIP; keep the working originals safely on your computer. Never distribute your school's data or passwords to another school.

## 2. Steps for the school

1. Extract the ZIP into a permanent folder.
2. Run `INSTALL_ERP.bat`. It installs dependencies, creates random local database settings if none exist, builds the app and creates a desktop shortcut. Existing settings and data are preserved.
3. Start the desktop shortcut or `RUN_ERP.bat`. This starts both the local database and app. Open http://localhost:3001 and keep the launcher window open.
4. Keep `.local-postgres/` and the original `.env.local` together. Download school backups regularly to a separate drive. After restarting Windows, start the shortcut again.

Existing online data is not imported automatically. The offline launcher refuses online database addresses. Parent access from outside this computer requires a separately configured network deployment.

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
