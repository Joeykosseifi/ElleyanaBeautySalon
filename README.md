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
#    then edit .env: set DATABASE_URL, and generate AUTH_SECRET with
#    openssl rand -base64 32

# 3. Create the database tables
npm run db:migrate          # prisma migrate dev (development)

# 4. Load demo data (WARNING: wipes the database it points at)
npm run db:seed

# 5. Run it
npm run dev                 # http://localhost:3000
```

Log in with the seeded owner account:

| Email | Password |
| --- | --- |
| `maya@salonflow.com` | `salonflow123` |

Change this password from **Settings** before using the app for real.

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
| `APP_URL` | Public URL, used in password-reset links |
| `RECEIPTS_DIR` | Where uploaded expense receipts are stored (default `./storage/receipts`) |

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit + integration tests |
| `npm run test:unit` | Pure business-logic tests (no database) |
| `npm run test:integration` | Service tests against `TEST_DATABASE_URL` (runs `prisma migrate deploy` first) |
| `npm run db:migrate` | Create/apply migrations in development |
| `npm run db:deploy` | Apply migrations in production |
| `npm run db:seed` | Reset the database and load demo data |

---

## Features

- **Home / Quick Add Sale.** Client search by name or phone, quick new client, or Walk-in. Employee auto-selected (remembered per device). Category tabs with large service cards. Order summary with quantity, remove, and $ or % discount. Paid / Partial / Unpaid with live remaining balance. Cash, Card, Bank Transfer, Whish, OMT or Other. Complete Sale shows a toast ("$50 added to outstanding balances.", "$15 remaining.") and resets for the next client. Today's summary and recent transactions sit beside it on desktop and below it on phones.
- **Sales.** Date filters (Today / Yesterday / This Week / This Month / Custom), search by client, phone, employee, service or sale number, status filters, and totals for the filter.
- **Sale details.** Services with price snapshots, subtotal, discount, total, paid, remaining, status, notes and a **payment history timeline**. **Add Payment** records later payments; it never overwrites earlier ones and never allows overpaying.
- **Clients.** Search, visits, last visit and outstanding balance. Each client has a profile with totals, unpaid balances (pay in place) and visit history. **Outstanding Payments** lists everyone who owes, largest balance first.
- **Reports.** Today / Yesterday / 7 Days / This Week / This Month / Last Month / Custom. Key figures, daily trend chart, profit breakdown, payment-method breakdown, payment-status report, expenses by category, per-service and per-employee tables (with optional commission), and a plain-language explanation of every metric.
- **Services.** Categories (order, active/inactive) and services (price, estimated cost, duration, notes, active). Deleting a service that has sales marks it inactive instead.
- **Expenses.** Category, description, amount, date, method, notes and an optional receipt photo or PDF.
- **Employees.** Role, phone, active, optional commission (percentage or fixed per service).
- **Settings.** Salon name and time zone, profile, change password, log out. Also: login, forgot password and reset password.

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
- **Price snapshots:** every sale item stores the service name, category, price and cost at the time of sale. Changing a price later never changes past sales.
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
  seed.ts                 Demo data
src/
  lib/
    domain/               Pure business logic (no I/O) — fully unit tested
      sale-calculations.ts  calculateSubtotal / Discount / FinalTotal / AmountPaid /
                            Remaining / PaymentStatus / ClientBalance / Profit
      reports.ts            calculateReports / ServiceMetrics / EmployeeMetrics / DailySeries
      date-range.ts         Salon-time-zone date presets
      money.ts, labels.ts
    validation/           Zod schemas shared by forms and the server
  server/
    services/             Database logic: sales, clients, reports, catalog, expenses, account
    actions/              Thin "use server" actions: auth check → service → revalidate
    auth-context.ts       Session → { userId, salonId, role }, re-checked against the DB
  components/
    ui/                   Button, Card, Modal, ConfirmationDialog, Toast, EmptyState, form fields…
    sales/                QuickAddSale, ServiceCard, ClientSelector, EmployeeSelector,
                          PaymentStatusSelector, PaymentMethodSelector, OrderSummary,
                          SaleRow, PaymentBadge, AddPaymentDialog
    reports/              MetricCard, DailyChart / BarBreakdown
    clients/ expenses/ employees/ services/ filters/ layout/ auth/
  app/
    (auth)/               login, forgot-password, reset-password
    (app)/                Authenticated pages (Home, Sales, Clients, Reports, …)
    api/                  Auth.js handlers, authenticated receipt download
tests/integration/        Service tests against a real PostgreSQL database
```

**Security**

- Auth.js credentials login with bcrypt hashes and signed JWT session cookies. Middleware protects every page except login and password reset.
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
npm run test:unit           # 31 tests, no database needed
npm run test:integration    # 17 tests, needs TEST_DATABASE_URL
```

The tests cover paid, partial and unpaid sales, later payments, UNPAID → PARTIAL → PAID, discounts (fixed, percentage, capped), price snapshots and old sales after a price change, client balances, daily and monthly reports, collected revenue by payment date, per-service and per-employee figures, time-zone date ranges, validation (no services, negative amounts, overpayment, unidentified walk-in debt, inactive services), concurrent payments, and isolation between salons. They include the spec's four acceptance scenarios (Sarah paid, Jessica unpaid, Maria partial, then Maria paying the rest).

---

## Known limitations (MVP)

- **Password-reset emails are not sent yet.** The reset link is written to the server log. Connect an email provider in `forgotPasswordAction` (`src/server/actions/account.ts`).
- There is no screen to invite more staff logins yet. The `User.role` field (OWNER / MANAGER / STAFF) and role checks are ready for it.
- Sales can't be edited or voided after saving. Payments are append-only by design.
- Not built yet (deliberately out of scope): appointments, inventory, loyalty, SMS/WhatsApp, payroll, multiple branches.
