# ▶️ RUN THIS — Supabase setup in 5 steps

Everything is prepared and tested. You only need to do these 5 things.
**Time: ~10 minutes. Cost: $0.**

---

## ✅ Step 1 — Create the Supabase project

Go to **<https://supabase.com/dashboard>** → sign in with GitHub → **New project**

| Field | What to enter |
|---|---|
| Name | `harmony-cafe` |
| Database Password | Click **Generate**, then save it in your password manager |
| Region | **Central EU (Frankfurt)** — best latency for Ethiopia |
| Plan | **Free** |

Click **Create new project** and wait ~2 minutes.

> You will never need that database password for this app. It's only for
> direct database access. Do not put it in any file.

---

## ✅ Step 2 — Run the database script

**Left sidebar → SQL Editor → "+ New query"**

Open the file **`supabase/00_run_all.sql`** from this repo, select **all** of it
(Ctrl+A), copy, paste into the editor, and press **RUN** (or Ctrl+Enter).

**Expected result:** `Success. No rows returned`

This one script creates all 4 tables, switches on all security policies,
creates the image bucket, enables live updates, and loads your existing
**27 menu items** and **7 categories**.

> Safe to run twice — it will not duplicate anything.

**Verify it worked:** left sidebar → **Table Editor**. You should see
`menu_items` (27 rows), `categories` (7 rows), `cafe_info` (1 row), `admin_users` (0 rows).

---

## ✅ Step 3 — Create your owner login

**Left sidebar → Authentication → Users → "Add user" → "Create new user"**

| Field | What to enter |
|---|---|
| Email | Your real email, e.g. `owner@harmonycafe.et` |
| Password | A strong password — **this is your admin login** |
| Auto Confirm User | ✅ **TICK THIS BOX** |

> ⚠️ If you forget to tick **Auto Confirm User**, login will fail later.
> Fix: click the user → **Confirm email**.

---

## ✅ Step 4 — Make yourself the admin

**Back to SQL Editor → "+ New query"**

Open **`supabase/04_create_owner.sql`**, and change **one line** — the email —
to the one you just used in Step 3:

```sql
target_email text := 'owner@harmonycafe.et';   -- 👈 put YOUR email here
```

Paste the whole file and press **RUN**.

**Expected result:** a table showing your email, plus a notice
`✅ "your@email" is now a cafe owner.`

> If you mistype the email, the script now **stops with a clear error**
> instead of silently doing nothing.

---

## ✅ Step 5 — Connect the website to the database

**Left sidebar → Settings ⚙️ → API.** Copy these two values:

| Supabase shows | Looks like |
|---|---|
| **Project URL** | `https://abcdefgh.supabase.co` |
| **anon** `public` | a long string starting `eyJhbGci...` |

### 5a. Check them first (recommended)

Open **`connect.html`** in your browser, paste both values, press
**Run connection check**. It confirms the tables exist, your menu loaded, and —
most importantly — that **strangers cannot edit your menu**. On success it
prints the exact config block to copy.

### 5b. Save them

Edit **`js/config.js`** and replace the two placeholder lines:

```js
window.HARMONY_CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',      // 👈 your Project URL
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5...',  // 👈 your anon public key
  ...
```

Then push:

```bash
git add js/config.js
git commit -m "Connect to Supabase"
git push
```

---

# 🔑 Which keys are safe?

| Key | Put it in the repo? | Why |
|---|---|---|
| **Project URL** | ✅ Yes | Just a public address |
| **anon / public** | ✅ Yes | Built for browsers; security policies limit it to *reading* the menu |
| **service_role** | 🚫 **NEVER** | Bypasses all security — anyone could delete your menu |
| Database password | 🚫 **NEVER** | Full database access |

The app **never** uses the service_role key. If you ever paste one anywhere in
this repo, go to **Settings → API → Rotate** immediately.

---

# 🎉 Step 6 — Turn it on and test

**GitHub → Settings → Pages → Source: "Deploy from a branch" → `main` → `/ (root)` → Save**

Wait ~1 minute, then:

| Page | URL |
|---|---|
| 📱 Customer menu | `https://musio09.github.io/harmoney/` |
| 🔐 Owner dashboard | `https://musio09.github.io/harmoney/admin/` |

**The full test:**

1. Open the **admin** URL and log in with your Step 3 email + password.
2. Find **Margherita** → **Edit** → change price `450` → `499` → **Save item**.
3. Open the **menu** URL on your phone → it shows **499 ETB**. ✅

Your existing QR code still works — the menu URL never changed.

---

# ❓ If something goes wrong

| Problem | Fix |
|---|---|
| "Invalid login credentials" | Password typo, or you skipped **Auto Confirm User** in Step 3 |
| "This account is not on the admin list" | Step 4 didn't run, or the email doesn't match Step 3 exactly |
| Menu says "not connected yet" | `js/config.js` still has placeholders — redo Step 5 |
| "relation does not exist" | Step 2 didn't run — re-run `00_run_all.sql` |
| Photo upload fails | Re-run `00_run_all.sql`; it recreates the `menu-images` bucket |
| Menu is blank after a week | Free projects pause after 7 days idle → Supabase dashboard → **Restore** |

---

# 📋 What's already done for you

- ✅ Database schema — 4 tables, indexes, auto-timestamps
- ✅ Security policies — customers read-only, only you can edit
- ✅ Your existing 27 items + 7 categories ready to load
- ✅ Image storage bucket
- ✅ Live updates (menu refreshes without reload)
- ✅ Admin dashboard with login
- ✅ **120 automated tests passing**, including the SQL verified against a real
  PostgreSQL server — schema, seed data, and every permission rule
