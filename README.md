# SalonFlow

SalonFlow is a responsive web app for beauty salons. Its main job is fast sale entry: the owner picks the client, taps the services, chooses **Paid / Partially Paid / Unpaid** and the payment method, then taps **Complete Sale**. A normal sale takes about 5–10 seconds. The app then works out the totals, client balances, reports and profit.

It runs in any browser: desktop, laptop, iPad/tablet and phone. There is no native app. The backend and business logic are kept separate from the UI so a mobile app could use them later.

**Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Prisma 6 · Auth.js v5 · Zod · Vitest

---

## Quick start

Requirements: **Node.js 20+** and **PostgreSQL 14+**.

```bash
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Configure environment
cp .env.example .env
#    then edit .env:
#      DATABASE_URL          your PostgreSQL connection
#      AUTH_SECRET           openssl rand -base64 32
#      SALON_SETUP_TOKEN     openssl rand -base64 32   (one-time; delete after the owner account exists)
#    (no owner email or password goes in .env — see "First run" below)

# 3. Create the database tables
npm run db:migrate          # prisma migrate dev (development)

# 4. Run it
npm run build && npm start  # http://localhost:3000 — fast; use this for day-to-day work
# or: npm run dev           # development mode (pages compile on first visit, slower)
```

> **Use the production build for real work.** In `npm run dev` every page is compiled the first time it is opened (about 1–1.5 s), and the development server then reloads that page once. A tap made during that reload is lost and the app appears to "do nothing". `npm run build && npm start` has neither problem (page changes take ~0.1–0.4 s).

### First run: create the owner account

Open the app on a brand-new database and it shows a one-time **Create owner account** screen (setup token, name, email, password, confirm password).

**The setup token protects the first run.** Without it, whoever reached a freshly deployed instance first could make themselves its owner. The person deploying SalonFlow sets a random `SALON_SETUP_TOKEN` (at least 24 characters, e.g. `openssl rand -base64 32`) in the server environment and types it into the setup screen.

- The server compares it in constant time. A missing or wrong token creates nothing.
- If the variable is missing or too short, the screen shows **Setup is locked** and no one can create an owner.
- The token is not the owner's password. It is never stored in the database, never logged, and never sent to the browser.
- Once the owner exists it no longer does anything. **Remove `SALON_SETUP_TOKEN` from the environment after setup.** Settings shows a reminder to the owner while it is still set.

The account it creates:

- is the **OWNER** of the salon **"Elleyana Beauty Salon"** (rename it in Settings),
- is stored only in PostgreSQL, with the password **bcrypt-hashed (cost 12)**. The owner's email and password are never in the code, `.env`, a seed file or the browser bundle,
- is signed in straight away.

The screen exists **only while the database has no users**. The server checks this inside a database transaction guarded by a Postgres advisory lock and a single-row `AppSetup` table, so two simultaneous visitors can never both create an owner. Once the owner exists, `/setup` redirects to the login page and the setup action is refused. Databases that already had an owner before this version are marked "set up" by the migration, so they never show the screen.

New passwords need 8+ characters with at least one letter and one number. Common passwords (e.g. `password123`) and the account's own email are refused.

A fresh setup contains only the salon and the owner account. There are **no demo clients, employees, services, sales, payments or expenses**. Add your real services (Services → Category → Service), employees and clients.

### Staying signed in

A login lasts **30 days** on that browser or installed app. Closing and reopening the browser, the PWA or the computer does not sign you out, and every visit pushes the 30 days forward. The session is a signed **HttpOnly** cookie (`SameSite=Lax`, `Secure` when served over HTTPS). It holds only an id, and every page and action checks that id against the `AuthSession` table in the database. No login data is kept in `localStorage`. You are signed out when:

- you tap **Log out** (that session is revoked in the database, not just the cookie deleted),
- you change your **password** or **email** in Settings (every *other* device is signed out; the one you're using stays in),
- a **password reset** is completed (every device is signed out),
- 30 days pass without opening the app.

### Changing the login email or password

**Settings → Login email** and **Settings → Change password**. Both ask for the current password. A new email must be valid and not used by another account (compared case-insensitively). A changed password works immediately, and the old one stops working. The credential update, the cancelling of unused password-reset links and the sign-out of every other device are **one database transaction**. If any part fails, nothing changes.

No internet connection is needed to build or run the app. It uses fonts already installed on the device (no Google Fonts download), so `npm run build`, `npm start` and `npm run dev` work offline.

### Starting over

```bash
npm run db:reset            # DELETES ALL DATA in DATABASE_URL (including the owner) and re-applies migrations
```

The next visit then shows the **Create owner account** screen again; set a new `SALON_SETUP_TOKEN` first. Only do this before real sales have been entered.

**Forgot the password?** Use **Forgot password** on the login page. No email service is connected yet, so the one-time reset link (valid 1 hour) is printed in the console of the computer running SalonFlow. Only someone with access to that machine can use it.

### Production

```bash
npm run build
npm run db:deploy           # prisma migrate deploy — applies migrations, never resets data
npm start
```

Set `AUTH_SECRET`, `DATABASE_URL` and `APP_URL` in production. Receipt images are saved on local disk in `RECEIPTS_DIR`. On hosts without a persistent disk (Vercel, etc.), replace `src/server/services/receipts.ts` with S3/R2 storage.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `TEST_DATABASE_URL` | Separate database for integration tests (its data is deleted on each run) |
| `AUTH_SECRET` | Secret used to sign session cookies |
| `SALON_SETUP_TOKEN` | One-time secret that authorises the first-run owner setup (24+ characters). Not a password. **Remove it after setup.** |
| `APP_URL` | Public URL, used in password-reset links |
| `RECEIPTS_DIR` | Where uploaded expense receipts are stored (default `./storage/receipts`) |

There are no owner credentials in the environment. The owner account is created on the first-run screen, authorised by `SALON_SETUP_TOKEN`.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (Turbopack; `npm run dev:webpack` for the classic bundler) |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests |
| `npm run test:unit` | Pure business-logic tests (no database) |
| `npm run test:integration` | Service tests against `TEST_DATABASE_URL` (runs `prisma migrate deploy` first) |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:reset` | **Delete all data** (including the owner) and re-apply migrations; the app then shows the first-run setup screen |

---

## Features

- **Home / Quick Add Sale.** Client search by name or phone, quick new client, or Walk-in. Employee auto-selected (remembered per device). Category tabs with large service cards, plus an **Other Service** card for one-off custom services (name, price, optional cost, quantity). Order summary with quantity, remove, and $ or % discount. Tap any price to change what this client is charged; the catalog price stays the same. Paid / Partial / Unpaid with live remaining balance. Cash, Card, Bank Transfer, Whish, OMT or Other. Complete Sale shows a toast ("$50 added to outstanding balances.", "$15 remaining.") and resets for the next client. Today's summary and recent transactions sit beside it on desktop and below it on phones.
- **Sales.** Date filters (Today / Yesterday / This Week / This Month / Custom), search by client, phone, employee, service or sale number, status filters, and totals for the filter.
- **Sale details.** Services with price snapshots, subtotal, discount, total, paid, remaining, status, notes and a **payment history timeline**. **Add Payment** records later payments; it never overwrites earlier ones and never allows overpaying. **Void Sale** (owner/manager) corrects a sale entered by mistake — see below.
- **Clients.** Search, visits, last visit and outstanding balance. Each client has a profile with totals, unpaid balances (pay in place) and visit history. **Outstanding Payments** lists everyone who owes, largest balance first.
- **Reports.** Today / Yesterday / 7 Days / This Week / This Month / Last Month / Custom. Key figures, daily trend chart, profit breakdown, payment-method breakdown, payment-status report, expenses by category, per-service and per-employee tables (with optional commission), and a plain-language explanation of every metric.
- **Services Performed** (Reports → *Services Performed*). An operational count, not a money report: how many times each service was done (`Manicure 12 · Pedicure 8 · Laser 5 …`), sorted by count.
  - **Summary:** services performed, clients served and different services.
  - **Filters:** Today / Yesterday / This Week / This Month / Custom (default Today, salon time zone), service, category (or *Custom services*), employee, and Paid / Partial / Unpaid.
  - **Detail:** tap a service to see each time it was performed (time, client or walk-in, employee), linking to the sale.
  - **Counting rules:** every service line counts (quantity 2 counts twice). Custom services count too, grouped by name, ignoring case and spaces, and never added to the catalog. Voided sales count nowhere.
  - **Source:** computed live from `Sale` + `SaleItem` with one SQL aggregation, no extra stored data.
- **Services.** Categories (order, active/inactive) and services (price, estimated cost, duration, notes, active). Deleting a service that has sales marks it inactive instead.
- **Expenses.** Category, description, amount, date, method, notes and an optional receipt photo or PDF.
- **Employees.** Role, phone, active, optional commission (percentage or fixed per service).
- **Settings.** Salon name and time zone, profile, change login email, change password, log out. Also: first-run owner setup, login (stays signed in for 30 days), forgot password and reset password.

Navigation: on desktop (≥1024px), a left sidebar. On phones and tablets, a bottom bar (Home, Sales, Reports, Clients, More).

---

## Financial rules

All money is stored as **integer cents**.

| Metric | Definition |
| --- | --- |
| Service Value | Σ sale final totals, by **service date**, after discounts |
| Collected Revenue | Σ payments, by **payment date** (includes payments on older sales) |
| Outstanding | For sales in the period: final total − everything paid so far |
| Service Costs | Σ cost snapshot × quantity |
| Estimated Cash Profit | Collected Revenue − Service Costs − Operating Expenses |
| Potential Revenue | Collected Revenue + Outstanding |
| Clients | Unique registered clients + each walk-in visit |
| Average Sale | Service Value ÷ number of sales |

- **Payment status is always derived from money:** paid ≥ total → `PAID`, paid ≤ 0 → `UNPAID`, otherwise `PARTIAL`. A $0 sale is `PAID`. The status the user picks only decides what is recorded at checkout. The server recalculates subtotal, discount, total and status from database prices, and ignores any totals the browser sends.
- **Payment date rule:** a $100 unpaid sale on Oct 1 that is paid on Oct 5 counts as +$100 service value on Oct 1 and +$100 collected on Oct 5.
- **Price snapshots:** every sale item stores the service name, category, catalog price and cost at the time of sale. Changing a catalog price later never changes past sales.
- **Per-sale price override:** each sale item stores both `standardPriceSnapshotCents` (the catalog price at the time) and `unitPriceChargedCents` (what this client paid per unit). `lineTotalCents = unitPriceChargedCents × quantity`, and every total, payment, balance and report uses the charged price. An override never changes the catalog. A sale-level discount is separate and can be used as well.
- **Custom services:** an "Other Service" line has `isCustom = true`, no `serviceId`, no standard price, and its own name, charged price and optional estimated cost. It is never added to the Services catalog. Reports group custom lines by name and mark them "Custom".
- **Complimentary services:** a $0 price is allowed. The service counts as performed but adds $0 to Service Value. A sale that is entirely free is `PAID`, with no payment record.
- **Voided sales:** sales are never deleted. Voiding records who voided it, when, and an optional reason. A voided sale and **all of its payments** are excluded from every figure: service value, collected revenue (even payments made on a later day), outstanding, profit, sales/service/client counts, client balances, the outstanding list, employee and service reports, and the Home summary. No further payments can be recorded on it. The record stays visible (marked **Voided**) under Sales → Voided.
- **Duplicate-proof saving:** each Complete Sale attempt carries a random key, unique per salon in the database. A double tap or network retry returns the sale already saved instead of creating a second one.
- **Walk-ins:** paid walk-ins need no profile. Unpaid or partial sales need a client name (phone recommended), so the salon knows who owes money.
- **No overpayment:** a payment can't exceed the remaining balance. Payments lock the sale row, so two payments made at the same moment can't both get through.
- Per-service figures spread each sale's discount and payments across its lines in proportion to price, rounded so they add back to the sale totals exactly.
- "Today", "This Month" and other date ranges use the **salon's time zone** (Settings), not the server's.

---

## Architecture

```
prisma/
  schema.prisma           Data model (every record scoped by salonId)
  migrations/             SQL migrations, incl. CHECK constraints (no negative prices,
                          payments > 0, total = subtotal − discount, …)
src/
  lib/
    domain/               Pure business logic (no I/O) — fully unit tested
      sale-calculations.ts  calculateSubtotal / Discount / FinalTotal / AmountPaid /
                            Remaining / PaymentStatus / ClientBalance / Profit
      cart.ts               Quick Add cart: price overrides, custom services, add/edit/remove
      reports.ts            calculateReports / ServiceMetrics / EmployeeMetrics / DailySeries
      date-range.ts         Salon-time-zone date presets
      money.ts, labels.ts
    validation/           Zod schemas shared by forms and the server
  server/
    services/             Database logic: sales, clients, reports, catalog, expenses, account,
                          auth (first-run owner, sessions, email/password change)
    actions/              Thin "use server" actions: auth check → service → revalidate
    auth-context.ts       Session cookie → AuthSession row → { userId, salonId, role }
  components/
    ui/                   Button, Card, Modal, ConfirmationDialog, Toast, EmptyState, form fields…
    sales/                QuickAddSale, ServiceCard, ClientSelector, EmployeeSelector,
                          PaymentStatusSelector, PaymentMethodSelector, OrderSummary,
                          CustomServiceDialog,
                          SaleRow, PaymentBadge, AddPaymentDialog
    reports/              MetricCard, DailyChart / BarBreakdown, ReportsTabs, ActivityFilters
    clients/ expenses/ employees/ services/ filters/ layout/ auth/
  app/
    (auth)/               setup (first run only), login, forgot-password, reset-password
    (app)/                Authenticated pages (Home, Sales, Clients, Reports, …)
    api/                  Auth.js handlers, authenticated receipt download
tests/integration/        Service tests against a real PostgreSQL database
```

**Security**

- Auth.js credentials login with bcrypt hashes (cost 12; unknown emails are checked against a dummy hash so timing doesn't reveal which emails exist). The signed, HttpOnly session cookie only carries an `AuthSession` id, which is checked in the database on every page and action, so Logout and password/email changes take effect immediately. Middleware protects every page except setup, login and password reset.
- The first-run owner screen requires the deployment's `SALON_SETUP_TOKEN` (constant-time comparison) and is enforced on the server (advisory lock + single-row `AppSetup` table).
- Email and password changes update the credentials, cancel reset links and revoke other sessions in a single transaction. Emails are stored lower-case with a unique index, which is enforced by a CHECK constraint.
- Server actions only accept same-origin POSTs (Next.js checks Origin against Host), which protects them against CSRF. Auth.js protects its own sign-in/sign-out endpoints with a CSRF token.
- Passwords are never logged or returned. Unexpected errors are logged as one sanitised line, with hashes and long tokens redacted.
- Every server action and page re-checks the user against the database and takes `salonId` from the session, never from the browser. Every query is scoped by `salonId`, and there are integration tests for this isolation.
- Owner/manager-only areas (Reports, Services, Expenses, Employees, salon settings) are checked on the server.
- All inputs are validated with Zod. CHECK constraints in the database are a second line of defence.
- Password-reset tokens are random, stored only as SHA-256 hashes, expire after 1 hour, and work once. The page never reveals whether an email exists.
- Receipts are stored outside `public/` and served only to users of the same salon. File names are sanitised.
- Security headers: `X-Frame-Options: DENY`, `nosniff`, a strict referrer policy.

**Built to grow.** Multiple salons and branches (the `Salon` model and `salonId` scoping are already in place), appointments (a future model linked to `Sale`), inventory, commissions (types and report already exist), notifications and WhatsApp reminders (would hook in where sales and payments are created), and subscriptions.

---

## Testing

```bash
npm run test:unit           # 71 tests, no database needed
npm run test:integration    # 96 tests, needs TEST_DATABASE_URL
```

The tests cover paid, partial and unpaid sales, later payments, UNPAID → PARTIAL → PAID, discounts (fixed, percentage, capped), price snapshots and old sales after a price change, client balances, daily and monthly reports, collected revenue by payment date, per-service and per-employee figures, time-zone date ranges, validation (no services, negative amounts, overpayment, unidentified walk-in debt, inactive services), concurrent payments, and isolation between salons. They also cover per-sale price overrides (a $15 Pedicure sold for $10: what's stored, the catalog left unchanged, reports, and paid/partial/unpaid) and custom services (stored, shown in client history and sale details, never added to the catalog, removable before checkout, validated). They include the spec's four acceptance scenarios (Sarah paid, Jessica unpaid, Maria partial, then Maria paying the rest).

**Voiding** (`tests/integration/void-sale.test.ts`) snapshots every business figure, adds a mistaken sale, voids it, and requires every figure to return exactly to its previous value. It also checks payments made on a later date, keeping the audit records, blocking further payments, double voids, the owner/manager role, isolation between salons, and the database constraint. **Authentication** (`tests/integration/auth.test.ts`) covers first-run setup. The setup token: correct works; missing, wrong or near-miss tokens create nothing; no or a short server token keeps setup locked; concurrent valid requests create one owner; the token is useless after setup; and it never appears in errors, logs or the database. Also: a fresh database needs setup; the first account is OWNER with a bcrypt hash; a second owner is refused; six concurrent setups create exactly one owner; invalid email or password creates nothing; older databases with users never show setup. It covers login (right/wrong password, case-insensitive email) and staying signed in across a browser and server restart, using a real Auth.js cookie. It covers logout and expired/forged sessions. It covers email and password changes: current password required, duplicates refused, old credentials stop working, other devices signed out. It checks that a password reset signs out everywhere. A database trigger that makes revocation fail proves that email and password changes roll back completely: old credentials still work, nothing is revoked, and reset links stay valid. **Persistence** (`tests/integration/persistence.test.ts`) creates a category, service, employee, client, partial sale with a later payment, voided sale, expense, salon settings and email change. It then logs out, logs in, restarts the database connection and changes the password, checking every record each time. **Services Performed** (`tests/integration/service-activity.test.ts`) covers:
- counting one service, several services on one sale, quantities, and several sales of the same service for different clients;
- custom services grouped by name;
- voided sales contributing nothing, including to the per-employee counts and the detail rows;
- the Paid, Partial, Unpaid, employee, category and service filters;
- detail rows;
- exact day boundaries in the salon time zone;
- different-services and total counts;
- salon isolation, and agreement with the existing Reports quantities.

**Saving** (`tests/integration/sale-save.test.ts`) checks that repeated and concurrent submissions create exactly one sale, one payment and one new client, and that the Home snapshot returned by the save already includes the new sale.

---

## Known limitations (MVP)

- **Password-reset emails are not sent yet.** The reset link is written to the server log. Connect an email provider in `forgotPasswordAction` (`src/server/actions/account.ts`).
- Failed logins are not rate-limited yet. Use a strong password, and add rate limiting (e.g. at the reverse proxy) before exposing the app to the internet.
- There is no screen to invite more staff logins yet. The `User.role` field (OWNER / MANAGER / STAFF) and role checks are ready for it.
- Sales can't be edited after saving. A mistaken sale is **voided** (and re-entered); voiding can't be undone. Payments are append-only by design.
- Not built yet (deliberately out of scope): appointments, inventory, loyalty, SMS/WhatsApp, payroll, multiple branches.
