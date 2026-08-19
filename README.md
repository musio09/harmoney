# 🍽 Harmony Cafe — QR Menu + Admin Dashboard

A zero-cost digital menu for Harmony Cafe (ASTU Gate, Adama). Customers scan the
QR code and see a live menu; the owner edits everything from a password-protected
dashboard — no code, no redeploys.

| | URL |
|---|---|
| 📱 Customer menu | `https://musio09.github.io/harmoney/` |
| 🔐 Owner dashboard | `https://musio09.github.io/harmoney/admin/` |

**➡️ START HERE: [RUN_THIS.md](RUN_THIS.md)** — the exact 5 steps to run
(detailed reference: [SETUP.md](SETUP.md))

---

## What the owner can do

- Log in securely (email + password)
- Add / edit / delete menu items — name, price, description (English + Amharic),
  emoji or uploaded photo, category, NEW/HOT badge, sort order
- Mark items **available / sold out** with one tap
- Add / edit / delete categories
- Edit cafe info — name, tagline, address, phone, currency, footer
- Log out

Every change appears on customer phones immediately.

---

## Architecture

```
┌──────────────────┐        read-only         ┌─────────────────┐
│  index.html      │ ───────────────────────► │                 │
│  customer menu   │ ◄─── realtime updates ── │    Supabase     │
└──────────────────┘                          │   (free tier)   │
                                              │                 │
┌──────────────────┐   authenticated writes   │  Postgres + RLS │
│  admin/          │ ◄──────────────────────► │  Auth + Storage │
│  owner dashboard │                          └─────────────────┘
└──────────────────┘
     hosted free on GitHub Pages (static)
```

No build step. No server. No framework. Plain HTML/CSS/JS + the Supabase JS SDK
from a CDN.

---

## Repository layout

```
index.html                  Customer menu (original design, now DB-driven)
harmony-logo.jpg            Logo / favicon
js/
  config.js                 ⚙️ YOUR two PUBLIC Supabase values go here
  supabase-client.js        Shared client, data access, auth, cache, realtime
  menu.js                   Customer menu renderer
admin/
  index.html                Login + dashboard UI
  admin.js                  Dashboard logic (CRUD, uploads, auth gate)
RUN_THIS.md                 ▶️ The exact steps to run — start here
connect.html                🔌 Connection checker — verifies your Supabase setup
supabase/
  00_run_all.sql            ⭐ Everything below in one paste
  01_schema.sql             Tables, indexes, triggers, realtime
  02_rls_policies.sql       Row Level Security + storage rules
  03_seed_data.sql          Your existing menu, ready to load
  04_create_owner.sql       Promote a user to cafe owner
dev/                        Local testing only — not used in production
  mock-supabase.js          In-memory fake Supabase backend
  test-e2e.js               48 automated end-to-end checks
  test-connect.js           22 checks for the connection checker
  test-sql.js               50 checks running the SQL on real PostgreSQL
  serve-demo.js             Clickable local demo
docs/
  github-pages-workflow.yml.txt   Optional Actions deploy template (not required)
SETUP.md                    Step-by-step setup guide
```

---

## Security model

| Who | Can read menu | Can change menu |
|---|---|---|
| Customer (anonymous) | ✅ | ❌ |
| Logged-in user *not* on the admin list | ✅ | ❌ |
| Cafe owner (in `admin_users`) | ✅ | ✅ |

Enforced by **Postgres Row Level Security**, not by the frontend — so blocking
is server-side and cannot be bypassed by editing JavaScript in the browser.

Admin rights come from membership in the `admin_users` table, which has **no
insert policy at all**. Rows can only be added from the Supabase SQL editor, so
nobody can promote themselves through the public API.

Only the **anon public** key ships in the browser (that is what it is for).
The **service_role** key is never used anywhere in this repository.

---

## Local development

```bash
# clickable demo with a mock database (no Supabase account needed)
node dev/serve-demo.js
# → http://localhost:8080
# → login: owner@harmonycafe.et / test-password-123
```

```bash
# run the automated test suite
npm install --no-save jsdom @supabase/supabase-js
node dev/test-e2e.js      # → 48 passed, 0 failed
node dev/test-connect.js  # → 22 passed, 0 failed
```

The SQL is verified against a real PostgreSQL server (schema, seed data, and
every RLS rule including privilege-escalation attempts):

```bash
npm install --no-save pg @embedded-postgres/linux-x64
node dev/test-sql.js      # → 50 passed, 0 failed
```

The tests boot a mock Supabase backend, load the real pages in jsdom, and verify
the whole flow — including *"change a price in the dashboard → the customer menu
shows the new price"*.

---

## Free-tier limits

| Resource | Free allowance | Realistic use for one cafe |
|---|---|---|
| Supabase database | 500 MB | A 500-item menu is well under 1 MB |
| Supabase bandwidth | 5 GB/month | Thousands of menu views |
| Supabase storage | 1 GB | ~1,000 compressed photos |
| Supabase monthly active users | 50,000 | You have 1–3 owner accounts |
| GitHub Pages | 1 GB site, 100 GB/month | Far more than needed |

⚠️ **Supabase pauses free projects after 7 days with no activity.** Customers
scanning the QR code count as activity, so an operating cafe never hits this.
If it does pause, open the Supabase dashboard and click **Restore** (~1 minute).
The customer menu keeps showing its cached copy in the meantime.
