# Harmony Cafe — Setup Guide

Everything you must do **once** to take this repo live. Total time: ~15 minutes.
Cost: **$0** (Supabase free tier + GitHub Pages).

---

## Step 1 — Create the Supabase project (free)

1. Go to <https://supabase.com> → **Start your project** → sign in with GitHub.
2. **New project**
   - **Name:** `harmony-cafe`
   - **Database password:** generate a strong one and save it in your password
     manager. *(You will not need it for this app — only for direct DB access.)*
   - **Region:** `Central EU (Frankfurt)` — closest to Ethiopia with good latency.
   - **Plan:** Free
3. Wait ~2 minutes for provisioning.

---

## Step 2 — Create the database

> 💡 For the condensed version of this whole guide see **[RUN_THIS.md](RUN_THIS.md)**.

Open **SQL Editor** → **New query**, paste the entire contents of
**`supabase/00_run_all.sql`**, and press **Run**. That one file creates the
tables, applies all security policies, creates the image bucket, and loads your
existing 27 menu items and 7 categories.

It is safe to re-run — nothing gets duplicated.

<details>
<summary>Prefer to run the steps separately?</summary>

| Order | File | What it does |
|---|---|---|
| 1 | `supabase/01_schema.sql` | Tables, indexes, triggers, realtime |
| 2 | `supabase/02_rls_policies.sql` | Security policies + image storage bucket |
| 3 | `supabase/03_seed_data.sql` | Your current 27 items and 7 categories |

</details>

---

## Step 3 — Create your owner account

**3a. Create the user** (dashboard, not SQL):

- **Authentication** → **Users** → **Add user** → **Create new user**
- Email: your real email, e.g. `owner@harmonycafe.et`
- Password: a strong password
- ✅ **Tick "Auto Confirm User"** ← if you skip this, login will fail

**3b. Grant admin rights** (SQL Editor):

Open `supabase/04_create_owner.sql`, change the email on the marked line to the
email you just used, then run it. It should return **one row** — that confirms
you are now an approved cafe owner.

> To add a second manager later, repeat 3a + 3b with their email.
> To revoke access, run the `delete from public.admin_users …` line at the
> bottom of that file.

---

## Step 4 — Paste your two PUBLIC keys

In Supabase: **Settings** (⚙️) → **API**. You need exactly two values:

| Supabase label | Looks like | Goes in |
|---|---|---|
| **Project URL** | `https://abcdefgh.supabase.co` | `js/config.js` → `SUPABASE_URL` |
| **anon** / **public** key | long string starting `eyJ…` | `js/config.js` → `SUPABASE_ANON_KEY` |

Edit **`js/config.js`** and replace the two placeholders:

```js
window.HARMONY_CONFIG = {
  SUPABASE_URL: 'https://abcdefgh.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi....',
  ...
};
```

Commit and push:

```bash
git add js/config.js
git commit -m "Add Supabase public config"
git push
```

### 🔌 Verify the connection before you push

Open **`connect.html`** in your browser (double-click the file, or visit
`https://musio09.github.io/harmoney/connect.html` once deployed). Paste the same
two values and press **Run connection check**. It will confirm:

- Supabase is reachable and the tables exist
- Your menu data loaded correctly
- The image bucket is ready
- **Anonymous visitors cannot modify your menu** ← the important one

If every check passes it prints the exact `js/config.js` block to copy.
If RLS is misconfigured it refuses to give you the config and tells you which
SQL file to re-run. It also detects and rejects a service_role key.

### ⚠️ Which key is safe to commit?

| Key | Safe in Git? | Why |
|---|---|---|
| **Project URL** | ✅ Yes | Just an address |
| **anon / public** | ✅ Yes | Designed for browsers; RLS limits it to reading the menu |
| **service_role** | ❌ **NEVER** | Bypasses all security — anyone could wipe your menu |
| DB password | ❌ **NEVER** | Full database access |

If you ever paste a service_role key into this repo, go to
**Settings → API → Rotate** immediately.

---

## Step 5 — Turn on GitHub Pages

1. GitHub repo → **Settings** → **Pages**
2. **Source:** *Deploy from a branch* → Branch **`main`** → folder **`/ (root)`** → **Save**
3. Wait ~1 minute. Your site is live at:
   - Menu: `https://musio09.github.io/harmoney/`
   - Admin: `https://musio09.github.io/harmoney/admin/`

Your existing QR code keeps working — the URL has not changed.

---

## Step 6 — Verify

1. Open the admin URL, log in with your owner account.
2. Change any price → **Save item**.
3. Open the menu URL in another tab → the new price is there.

Done. 🎉

---

## Daily use

| Task | Where |
|---|---|
| Change a price | Admin → Menu Items → **Edit** |
| Mark something sold out | Admin → Menu Items → toggle the switch |
| Add a new dish | Admin → Menu Items → **+ Add Item** |
| Add a photo | Edit item → **Photo** → choose file |
| New category | Admin → Categories → **+ Add Category** |
| Change phone/address | Admin → Cafe Info |

Changes appear on customer phones **immediately** (open tabs update live;
new visitors always get fresh data).
