# Ski Club IS
 
Club management information system for a ski club. It brings members, parent contacts, payments, attendance, equipment rental and club paperwork into one installable web app, with separate access for administrators and coaches.
 
The system was built for a real club and is used in production. This repository is the portfolio version: the club's name, branding and data are removed, and every club detail you see here is a placeholder. The interface and routes are in Slovak.
 
## What it does
 
**Members and contacts**
- Member records with search, filters, A–Z index and bulk actions
- Parent and guardian contacts linked to each child
- Seasons with an archive, so every record keeps its history
**Payments**
- Fee categories and payment prescriptions, one-off or monthly
- Permanent variable symbol per member, assigned by a database sequence
- Bank statement import with automatic matching by variable symbol and amount
- Overdue overview with ready-to-send reminder text
- Tax-assignation donations: import, per-child totals and an automatic credit against fees
**Attendance, equipment and events**
- Attendance by team, entered manually or imported, with a monthly overview
- Equipment rental: priced categories, inventory, loans and stock-taking
- Camps and events with participants, deposits and balances
**Documents and data exchange**
- Confirmations of sports activity, printable to PDF
- Spreadsheet import (XLSX and CSV) with several files at once, column mapping, preview and duplicate detection
- Import and matching of registrations from the national sports register
- CSV export of members, contacts, payments, equipment and loans
**App**
- Installable PWA for phone and desktop
- Web push notifications for finished imports, generated confirmations and overdue payments
- Sign-in with e-mail and password, password recovery, optional Google sign-in
## Tech stack
 
| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router, server actions), React 19, TypeScript |
| Backend | Supabase: Auth, PostgreSQL, row-level security |
| Notifications | Web Push (VAPID), scheduled job via Vercel Cron |
| Hosting | Vercel |
| Tooling | pnpm, ESLint, Node test runner |
 
## Architecture
 
The app has a single data layer (`lib/data`) with two interchangeable storage backends:
 
- **Demo mode** (`DEMO_MODE=true`) stores data in a local JSON file. No Supabase project is needed, which makes it suitable for trying the app and for UI work.
- **Production** stores everything in Supabase behind row-level security.
Pages and server actions only ever call `getSession()` and do not know which backend is running. The app refuses to start in demo mode on a hosting platform, because the local file would be discarded between requests.
 
The schema lives in `supabase/migrations` as 18 ordered SQL migrations.
 
## Security design
 
The system holds personal data of children and their parents, so access control is enforced in the database, not in the UI.
 
- **No anonymous access.** Every read and write goes through an authenticated session. Public sign-up is disabled and accounts are created by an administrator.
- **Sensitive fields are isolated.** National ID numbers and home addresses live in separate tables that only administrators can read.
- **Coaches see only their own teams.** They can record attendance and view payment status for their teams, and have no access to confirmations, imports or settings. This is enforced by row-level security policies.
- **Roles cannot be self-assigned.** New accounts always start as coaches; only an administrator can promote one.
- **Imports run once.** Each import carries a single-use token, so a double submit cannot duplicate data.
- **Nothing sensitive is cached on the device.** The service worker caches build assets, icons and an offline page only, so no personal data stays on a phone after sign-out.
- **No secrets reach the browser.** No environment variable uses the `NEXT_PUBLIC_` prefix; Supabase and push are read on the server only.
## Engineering notes
 
- **XLSX parsing without a dependency.** `lib/xlsx-read.ts` unpacks the workbook with Node's built-in `zlib` and reads the XML of every sheet.
- **Tolerant column mapping.** `lib/parse-spreadsheet.ts` normalizes header names, so several files with slightly different headers map onto the same fields in one import.
- **PDF through print styles.** Confirmations and payment lists have dedicated print pages (`@media print`), so no PDF library runs on the server.
- **Dates are stored as dates.** Birth dates are kept as `YYYY-MM-DD` and age is never stored as a computed value.
## Getting started
 
Requirements: Node.js 22 or newer and pnpm.
 
```bash
pnpm install
cp .env.example .env.local
pnpm dev
```
 
Set `DEMO_MODE=true` in `.env.local` to run without Supabase.
 
### Running against Supabase
 
1. Create a Supabase project.
2. Run the files in `supabase/migrations` in name order.
3. Disable public sign-up and create the first user under Authentication.
4. Promote that user to administrator:
```sql
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'you@example.com');
```
 
5. Fill in the Supabase URL and publishable key in `.env.local` and set `DEMO_MODE=false`.
### Environment variables
 
| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Used only by the scheduled notification job; server only |
| `DEMO_MODE` | `true` for the local JSON store, `false` in production |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push keys |
| `CRON_SECRET` | Protects the scheduled reminder endpoint |
 
## Scripts
 
| Command | What it does |
|---|---|
| `pnpm dev` | Start the development server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | TypeScript check |
| `pnpm test` | Unit tests for domain logic, push and donation matching |
 
## Project structure
 
```
app/                  Routes and server actions (members, payments, attendance, rental, events, imports)
components/           UI components
lib/                  Domain logic, spreadsheet parsing, push
lib/data/             Data layer with the local and Supabase backends
supabase/migrations/  Database schema and row-level security policies
public/               PWA manifest, service worker, icons
tools/                One-off data preparation scripts
```
 
## Deployment
 
The app is deployed on Vercel with the environment variables above stored as secrets. `vercel.json` schedules a daily job that sends reminders for overdue payments. Push notifications and the service worker need HTTPS, and on iOS notifications work only from the app installed on the home screen.
