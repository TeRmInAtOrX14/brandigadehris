# Brandigade HRIS

A self-hosted HR system built for Brandigade's internal use: employee records, org chart,
leave management, attendance tracking, and payroll with auto-generated PDF payslips.

This is real, working software — not a demo. It has a proper backend, a database, password
hashing, and role-based access control (Admin vs Employee). You are responsible for deploying
and securing it, so please read the **Security checklist** before putting real employee data
into it.

---

## What's included

- **Authentication** — admin and employee logins. Admin creates each employee's account
  (this is your "license"/seat creation) and gets a temporary password to share with them.
  Employees are forced to set their own password on first login.
- **Employee records** — name, designation, department, manager, salary, contact info,
  employment status.
- **Org chart** — built automatically from each employee's assigned manager.
- **Leave management** — configurable leave types (Annual, Sick, Casual, Unpaid by default),
  employee self-service leave requests, admin approve/reject, automatic balance tracking.
- **Attendance** — admin marks attendance per day (bulk "mark everyone present" with
  per-person overrides for absences/half-days).
- **Payroll** — monthly payroll runs. Pay is automatically pro-rated against attendance
  (unpaid absences reduce pay; approved leave does not). Admin can add a bonus or extra
  deduction per employee before finalizing. Finalizing locks the run and generates a
  PDF payslip for every employee, downloadable by the employee or the admin.
- **Salary increments** — logged with a date and reason, so there's a full history per
  employee, not just the current number.

## What's *not* included (be aware of this)

This covers the core of an HRIS but is intentionally scoped down from a commercial product:

- No tax withholding / statutory deduction calculations (Pakistan income tax, EOBI, etc.) —
  the "Other Deductions" field on a payroll run is a manual override for now. If you need
  real tax compliance, this needs further work before you rely on it for that.
- No email notifications (e.g. "your leave was approved") — everything is visible in-app only.
- No file attachments (e.g. uploading ID documents).
- No multi-company / multi-currency support beyond the `currency` field per employee.
- Single admin role — there's no "HR manager who isn't a full admin" tier yet.

---

## Requirements

- **Node.js 22.5 or newer** (this project uses Node's built-in SQLite support, so there is
  no native module to compile — it should "just work" on any server with a recent Node).
- A server or VPS you control (this is *not* meant to run on Claude's infrastructure —
  you need to host it yourself, e.g. a small DigitalOcean/Linode/Railway/Render instance,
  or even a spare office machine that stays on).

Check your Node version:
```bash
node -v
```
If it's older than v22.5, install a newer Node first (e.g. via [nvm](https://github.com/nvm-sh/nvm)).

---

## Setup (first time)

1. **Copy this whole `hris` folder** to your server.

2. **Install backend dependencies:**
   ```bash
   cd hris/backend
   npm install
   ```

3. **Create your environment file:**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and set real values:
   - `JWT_SECRET` — generate one with:
     ```bash
     node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
     ```
     Paste the output in as `JWT_SECRET`. Never reuse the example value.
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` — this becomes the first admin
     account (yours). **Use a strong password.** You'll be prompted to change it on
     first login anyway, but don't leave the placeholder in even temporarily on a
     real server.
   - `COMPANY_NAME` / `COMPANY_ADDRESS` — shown on payslips.

4. **Create the database and the admin account:**
   ```bash
   npm run seed
   ```
   This only creates the admin account if one doesn't already exist, so it's safe to
   re-run later (e.g. after pulling an update) without wiping your data.

5. **Start the server:**
   ```bash
   npm start
   ```
   You should see `Brandigade HRIS running on port 4000`. Open `http://your-server:4000`
   in a browser (or `http://localhost:4000` if running locally).

6. **Log in** with the admin email/password from your `.env`, and set a new password
   when prompted.

That's it — the same server serves both the API and the web app, so there's nothing
else to deploy separately.

---

## Running it permanently (so it survives reboots / doesn't die when you close your terminal)

Don't just leave `npm start` running in a terminal window for a real deployment — use a
process manager. The simplest option is **pm2**:

```bash
npm install -g pm2
cd hris/backend
pm2 start src/server.js --name brandigade-hris
pm2 save
pm2 startup    # follow the printed instructions to enable auto-start on reboot
```

Useful pm2 commands:
```bash
pm2 logs brandigade-hris      # view logs
pm2 restart brandigade-hris   # restart after an update
pm2 stop brandigade-hris      # stop it
```

### Putting it behind a real domain (recommended)

Right now this serves plain HTTP on port 4000. For real use, put it behind a reverse
proxy (e.g. **Nginx** or **Caddy**) with a real domain and HTTPS (e.g. via Let's Encrypt/
Certbot, or Caddy's automatic HTTPS). Logging in sends a password over the network — do
not expose this directly over plain HTTP on the open internet.

A minimal Caddy example (`Caddyfile`):
```
hris.brandigade.com {
    reverse_proxy localhost:4000
}
```
Caddy handles HTTPS automatically. Point your domain's DNS A record at your server's IP
and run `caddy run`.

---

## Day-to-day usage

### Creating an employee account ("issuing a license")
Admin → **Employees** → **+ Add Employee**. Fill in name, work email, designation,
department, join date, and starting salary. You'll get a **temporary password** shown
once — copy it and send it to the employee through a secure channel (not an unencrypted
group chat ideally, but at minimum DM it rather than posting publicly). They'll be forced
to set their own password the first time they log in.

### Running payroll each month
Admin → **Payroll** → pick the month/year → **Start / Open run**. This shows a draft
preview calculated from attendance (unpaid absences reduce pay automatically). Add any
bonus or extra deduction per employee, then **Finalize & generate payslips**. Once
finalized, a run is locked — it can't be edited again — so check the preview numbers
before finalizing. Employees can immediately see and download their payslip PDF from
**My Payslips**.

### Marking attendance
Admin → **Attendance** → pick a date → choose a default status (Present is normal,
use Holiday/Weekend on non-working days) → override specific people who were absent
or half-day → **Apply to all active employees**. Do this once a day, or in a batch at
the end of the month before running payroll — either works, since payroll just reads
whatever attendance rows exist for that month.

### Approving leave
Admin → **Leave** shows every request across the company. Approve or reject pending
ones. Approving automatically deducts the days from that employee's leave balance and
marks those days as "leave" in attendance (so payroll won't dock their pay for them).

### Salary increments
Admin → **Employees** → **Manage** on the employee → enter a new salary and a reason →
**Apply increment**. This updates their current salary going forward and keeps the old
amount in their visible salary history.

---

## Security checklist before you put real data in this

- [ ] Changed `JWT_SECRET` in `.env` to a real random value (not the placeholder).
- [ ] Changed the admin password from whatever was in `.env` (you'll be forced to on
      first login, but make sure it's actually strong).
- [ ] Running behind HTTPS (see reverse proxy section above) — don't run this on plain
      HTTP if it's reachable from outside your office network.
- [ ] The `backend/data/hris.db` file (and its `-wal`/`-shm` companion files) contains
      everyone's salary and personal data. Back it up regularly, and make sure the
      server itself is reasonably secured (normal OS-level hygiene: firewall, SSH key
      auth, keep the OS patched).
- [ ] `.env` is never committed to git or shared — it contains your JWT signing secret.
- [ ] If you ever suspect a token was leaked, you can invalidate all sessions at once
      by changing `JWT_SECRET` and restarting the server (this logs everyone out).

## Backing up your data

Everything lives in one file: `backend/data/hris.db` (plus `hris.db-wal` and
`hris.db-shm` if present — copy all three together, or stop the server first to be safe).
Copy that file somewhere safe on a schedule (a daily cron job running `cp` to another
disk or cloud storage is enough for a team this size).

---

## Project structure

```
hris/
  backend/
    src/
      db/            SQLite schema + seed script
      middleware/     Auth (JWT) checks
      routes/         API endpoints (auth, employees, leave, attendance, payroll)
      utils/          PDF payslip generator
      server.js       Entry point — also serves the frontend
    .env.example       Copy to .env and fill in
    package.json
  frontend/
    public/
      index.html       Single-page app shell
      app.js            All frontend logic (no build step, no framework)
```

## Extending this later

A few things you may want to add as Brandigade grows:
- Email/WhatsApp notifications for leave approvals and new payslips.
- A second admin tier ("HR" role that can't see salaries but can manage attendance/leave).
- Proper Pakistan tax/EOBI deduction calculation built into payroll instead of manual overrides.
- CSV export of payroll runs for your accountant.

None of these require re-architecting anything — they're additive to the routes and
schema that already exist.
