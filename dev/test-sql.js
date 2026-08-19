/* ============================================================================
 *  HARMONY CAFE — SQL verification against a REAL PostgreSQL server
 *  ----------------------------------------------------------------------------
 *  Recreates the parts of a Supabase project that our SQL depends on
 *  (auth schema, anon/authenticated roles, storage tables, the
 *  supabase_realtime publication), then executes supabase/00_run_all.sql
 *  exactly as you will paste it into the SQL Editor.
 *
 *  It then proves the security model by connecting AS the anon role and AS an
 *  authenticated owner, checking who can read and who can write.
 *
 *  Run:  node dev/test-sql.js
 * ==========================================================================*/
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require(process.env.PG_PATH || 'pg');

const ROOT = path.join(__dirname, '..');
const CONN = {
  host: process.env.PGHOST || '/tmp/pgtest',
  port: Number(process.env.PGPORT || 55432),
  user: 'postgres',
  database: 'postgres',
};

let passed = 0, failed = 0;
const out = [];
function check(name, cond, detail) {
  if (cond) { passed++; out.push('  ✅ ' + name); }
  else { failed++; out.push('  ❌ ' + name + (detail ? '\n       → ' + detail : '')); }
}

/** Minimal Supabase scaffolding that must exist before our SQL runs. */
const SUPABASE_PRELUDE = `
drop database if exists harmony_test;
`;

const BOOTSTRAP = `
create extension if not exists "pgcrypto";

-- roles Supabase provides
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
  if not exists (select 1 from pg_roles where rolname='authenticator') then create role authenticator login noinherit; end if;
end $$;

grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;

-- auth schema
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  email_confirmed_at timestamptz,
  created_at timestamptz default now()
);
grant usage on schema auth to anon, authenticated, service_role;

-- auth.uid() reads the request JWT claims, exactly like Supabase
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- storage schema
create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid, created_at timestamptz default now()
);
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;

-- realtime publication
do $$ begin
  if not exists (select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
`;

async function admin(sql) {
  const c = new Client(Object.assign({}, CONN, { database: 'harmony_test' }));
  await c.connect();
  try { return await c.query(sql); } finally { await c.end(); }
}

/** Run statements as a given Postgres role, optionally with a JWT sub claim. */
async function asRole(role, userId, fn) {
  const c = new Client(Object.assign({}, CONN, { database: 'harmony_test' }));
  await c.connect();
  try {
    if (userId) await c.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    else await c.query(`select set_config('request.jwt.claim.sub', '', false)`);
    await c.query(`set role ${role}`);
    return await fn(c);
  } finally {
    await c.end();
  }
}

/** Returns {ok:true} or {ok:false, code, message} */
async function attempt(client, sql, params) {
  try { const r = await client.query(sql, params); return { ok: true, rows: r.rows, count: r.rowCount }; }
  catch (e) { return { ok: false, code: e.code, message: e.message }; }
}

async function main() {
  console.log('\n═══ SQL VERIFICATION — real PostgreSQL ═══\n');

  // ── create a clean database ───────────────────────────────────────────────
  const root = new Client(CONN);
  await root.connect();
  await root.query('drop database if exists harmony_test');
  await root.query('create database harmony_test');
  await root.end();

  console.log('▸ 1. Bootstrapping a Supabase-like environment');
  await admin(BOOTSTRAP);
  check('Supabase scaffolding created (auth, storage, roles)', true);

  // ── THE ACTUAL FILE YOU WILL PASTE ───────────────────────────────────────
  console.log('▸ 2. Running supabase/00_run_all.sql verbatim');
  const runAll = fs.readFileSync(path.join(ROOT, 'supabase/00_run_all.sql'), 'utf8');
  let sqlOk = true, sqlErr = '';
  try { await admin(runAll); } catch (e) { sqlOk = false; sqlErr = e.message; }
  check('00_run_all.sql executes without error', sqlOk, sqlErr);
  if (!sqlOk) { report(); return; }

  // idempotency — you may safely paste it twice
  let twiceOk = true, twiceErr = '';
  try { await admin(runAll); } catch (e) { twiceOk = false; twiceErr = e.message; }
  check('00_run_all.sql is safe to re-run (idempotent)', twiceOk, twiceErr);

  // ── schema shape ─────────────────────────────────────────────────────────
  console.log('▸ 3. Verifying the schema');
  const tables = (await admin(`select table_name from information_schema.tables
    where table_schema='public' order by table_name`)).rows.map(r => r.table_name);
  check('table menu_items exists', tables.includes('menu_items'), tables.join(', '));
  check('table categories exists', tables.includes('categories'));
  check('table cafe_info exists', tables.includes('cafe_info'));
  check('table admin_users exists', tables.includes('admin_users'));

  const rls = (await admin(`select relname, relrowsecurity from pg_class
    where relname in ('menu_items','categories','cafe_info','admin_users')`)).rows;
  check('RLS enabled on all four tables', rls.every(r => r.relrowsecurity),
    JSON.stringify(rls));

  const seedItems = (await admin('select count(*)::int n from menu_items')).rows[0].n;
  const seedCats = (await admin('select count(*)::int n from categories')).rows[0].n;
  const cafeRow = (await admin('select count(*)::int n from cafe_info')).rows[0].n;
  check('27 menu items seeded', seedItems === 27, 'got ' + seedItems);
  check('7 categories seeded', seedCats === 7, 'got ' + seedCats);
  check('cafe_info row created', cafeRow === 1, 'got ' + cafeRow);
  check('re-running did NOT duplicate the seed', seedItems === 27 && seedCats === 7);

  const bucket = (await admin(`select id, public from storage.buckets where id='menu-images'`)).rows;
  check('menu-images storage bucket created and public',
    bucket.length === 1 && bucket[0].public === true, JSON.stringify(bucket));

  const pub = (await admin(`select tablename from pg_publication_tables
    where pubname='supabase_realtime' order by tablename`)).rows.map(r => r.tablename);
  check('realtime publishes menu_items', pub.includes('menu_items'), pub.join(', '));
  check('realtime publishes categories', pub.includes('categories'));

  // spot-check the data matches the original menu
  const marg = (await admin(`select price::numeric::float8 p from menu_items where name='Margherita'`)).rows;
  check('Margherita seeded at 450', marg.length === 1 && marg[0].p === 450, JSON.stringify(marg));
  const amharic = (await admin(`select count(*)::int n from menu_items
    where description_am is not null`)).rows[0].n;
  check('Amharic descriptions preserved', amharic >= 4, 'got ' + amharic);
  const badges = (await admin(`select count(*)::int n from menu_items where badge='new'`)).rows[0].n;
  check('NEW badges preserved', badges === 5, 'got ' + badges);

  // ── create an owner, like Step 3 of SETUP.md ─────────────────────────────
  console.log('▸ 4. Creating the cafe owner (simulating 04_create_owner.sql)');
  const ownerId = (await admin(`insert into auth.users (email, email_confirmed_at)
    values ('owner@harmonycafe.et', now()) returning id`)).rows[0].id;
  const stranger = (await admin(`insert into auth.users (email, email_confirmed_at)
    values ('random@customer.com', now()) returning id`)).rows[0].id;

  const createOwner = fs.readFileSync(path.join(ROOT, 'supabase/04_create_owner.sql'), 'utf8');
  await admin(createOwner);
  const admins = (await admin('select email from admin_users')).rows;
  check('04_create_owner.sql promotes exactly one owner',
    admins.length === 1 && admins[0].email === 'owner@harmonycafe.et', JSON.stringify(admins));

  // ── SECURITY: anonymous customer ─────────────────────────────────────────
  console.log('▸ 5. 🔒 Security as an ANONYMOUS customer');
  await asRole('anon', null, async (c) => {
    const read = await attempt(c, 'select * from menu_items');
    check('anon CAN read the menu', read.ok && read.rows.length === 27,
      read.ok ? 'rows=' + read.rows.length : read.message);

    const readCat = await attempt(c, 'select * from categories');
    check('anon CAN read categories', readCat.ok && readCat.rows.length === 7);

    const readCafe = await attempt(c, 'select * from cafe_info');
    check('anon CAN read cafe info', readCafe.ok && readCafe.rows.length === 1);

    const ins = await attempt(c, `insert into menu_items (name, price) values ('HACKED', 1)`);
    check('anon CANNOT insert a menu item', !ins.ok, ins.ok ? 'INSERT SUCCEEDED — RLS BROKEN' : ins.code);

    const upd = await attempt(c, `update menu_items set price = 1 where name = 'Margherita'`);
    check('anon CANNOT change a price', !upd.ok || upd.count === 0,
      upd.ok && upd.count > 0 ? 'UPDATE AFFECTED ' + upd.count + ' ROWS — RLS BROKEN' : 'blocked');

    const del = await attempt(c, `delete from menu_items where name = 'Margherita'`);
    check('anon CANNOT delete a menu item', !del.ok || del.count === 0,
      del.ok && del.count > 0 ? 'DELETE REMOVED ROWS — RLS BROKEN' : 'blocked');

    const cat = await attempt(c, `insert into categories (slug, name) values ('hack','Hack')`);
    check('anon CANNOT create a category', !cat.ok, cat.ok ? 'INSERT SUCCEEDED' : cat.code);

    const cafe = await attempt(c, `update cafe_info set phone='+000' where id=1`);
    check('anon CANNOT edit cafe info', !cafe.ok || cafe.count === 0, 'blocked');

    const adm = await attempt(c, 'select * from admin_users');
    check('anon CANNOT see the admin list', adm.ok ? adm.rows.length === 0 : true,
      adm.ok ? 'rows=' + adm.rows.length : 'blocked');

    // the privilege-escalation attempt
    const esc = await attempt(c,
      `insert into admin_users (user_id, email) values ($1,'attacker@evil.com')`, [stranger]);
    check('🚨 anon CANNOT promote itself to admin', !esc.ok,
      esc.ok ? 'PRIVILEGE ESCALATION POSSIBLE' : esc.code);
  });

  // ── SECURITY: logged in, but NOT an owner ────────────────────────────────
  console.log('▸ 6. 🔒 Security as a LOGGED-IN NON-OWNER');
  await asRole('authenticated', stranger, async (c) => {
    const read = await attempt(c, 'select * from menu_items');
    check('non-owner CAN read the menu', read.ok && read.rows.length === 27);

    const ins = await attempt(c, `insert into menu_items (name, price) values ('HACKED2', 1)`);
    check('non-owner CANNOT insert', !ins.ok, ins.ok ? 'INSERT SUCCEEDED' : ins.code);

    const upd = await attempt(c, `update menu_items set price=1 where name='Margherita'`);
    check('non-owner CANNOT change a price', !upd.ok || upd.count === 0,
      upd.ok && upd.count > 0 ? 'AFFECTED ' + upd.count : 'blocked');

    const del = await attempt(c, `delete from categories`);
    check('non-owner CANNOT delete categories', !del.ok || del.count === 0, 'blocked');

    const esc = await attempt(c,
      `insert into admin_users (user_id, email) values ($1,'attacker@evil.com')`, [stranger]);
    check('🚨 non-owner CANNOT promote itself to admin', !esc.ok,
      esc.ok ? 'PRIVILEGE ESCALATION POSSIBLE' : esc.code);

    const rpc = await attempt(c, 'select public.is_admin() as v');
    check('is_admin() returns false for a non-owner', rpc.ok && rpc.rows[0].v === false,
      JSON.stringify(rpc.rows));
  });

  // ── the owner CAN manage everything ──────────────────────────────────────
  console.log('▸ 7. ✅ The cafe owner CAN manage the menu');
  await asRole('authenticated', ownerId, async (c) => {
    const rpc = await attempt(c, 'select public.is_admin() as v');
    check('is_admin() returns true for the owner', rpc.ok && rpc.rows[0].v === true);

    const upd = await attempt(c, `update menu_items set price=499 where name='Margherita'`);
    check('owner CAN change a price', upd.ok && upd.count === 1,
      upd.ok ? 'rows=' + upd.count : upd.message);

    const ins = await attempt(c,
      `insert into menu_items (name, price, category_id)
       values ('Test Mocha', 175, (select id from categories where slug='coffee')) returning id`);
    check('owner CAN add a menu item', ins.ok, ins.ok ? '' : ins.message);

    const avail = await attempt(c, `update menu_items set is_available=false where name='Test Mocha'`);
    check('owner CAN mark an item sold out', avail.ok && avail.count === 1);

    const del = await attempt(c, `delete from menu_items where name='Test Mocha'`);
    check('owner CAN delete a menu item', del.ok && del.count === 1);

    const cat = await attempt(c, `insert into categories (slug,name,emoji) values ('desserts','Desserts','🍰')`);
    check('owner CAN add a category', cat.ok, cat.ok ? '' : cat.message);

    const catUpd = await attempt(c, `update categories set name='Sweets' where slug='desserts'`);
    check('owner CAN edit a category', catUpd.ok && catUpd.count === 1);

    const catDel = await attempt(c, `delete from categories where slug='desserts'`);
    check('owner CAN delete a category', catDel.ok && catDel.count === 1);

    const cafe = await attempt(c, `update cafe_info set tagline='Best in Adama' where id=1`);
    check('owner CAN edit cafe info', cafe.ok && cafe.count === 1);
  });

  // ── the price change is visible to customers ─────────────────────────────
  console.log('▸ 8. ⭐ Owner price change is visible to anonymous customers');
  await asRole('anon', null, async (c) => {
    const r = await attempt(c, `select price::numeric::float8 p from menu_items where name='Margherita'`);
    check('⭐ customer sees the new price 499', r.ok && r.rows[0].p === 499,
      r.ok ? 'got ' + r.rows[0].p : r.message);
  });

  // ── updated_at trigger ───────────────────────────────────────────────────
  console.log('▸ 9. Triggers');
  const t1 = (await admin(`select updated_at from menu_items where name='Pepperoni'`)).rows[0].updated_at;
  await new Promise(r => setTimeout(r, 60));
  await admin(`update menu_items set price=521 where name='Pepperoni'`);
  const t2 = (await admin(`select updated_at from menu_items where name='Pepperoni'`)).rows[0].updated_at;
  check('updated_at is maintained automatically', new Date(t2) > new Date(t1));

  // ── constraints ──────────────────────────────────────────────────────────
  console.log('▸ 10. Data integrity');
  const neg = await admin(`select 1`).then(async () => {
    try { await admin(`insert into menu_items (name, price) values ('Bad', -5)`); return { ok: true }; }
    catch (e) { return { ok: false, code: e.code }; }
  });
  check('negative prices are rejected', !neg.ok, neg.ok ? 'ACCEPTED -5' : neg.code);

  const dupSlug = await (async () => {
    try { await admin(`insert into categories (slug,name) values ('pizza','Dup')`); return { ok: true }; }
    catch (e) { return { ok: false, code: e.code }; }
  })();
  check('duplicate category slugs are rejected', !dupSlug.ok, dupSlug.ok ? 'ACCEPTED' : dupSlug.code);

  const badBadge = await (async () => {
    try { await admin(`insert into menu_items (name,price,badge) values ('B',1,'bogus')`); return { ok: true }; }
    catch (e) { return { ok: false, code: e.code }; }
  })();
  check('invalid badge values are rejected', !badBadge.ok, badBadge.ok ? 'ACCEPTED' : badBadge.code);

  const catDelete = await (async () => {
    await admin(`insert into categories (slug,name) values ('tmp','Tmp')`);
    await admin(`insert into menu_items (name,price,category_id)
                 values ('TmpItem',10,(select id from categories where slug='tmp'))`);
    await admin(`delete from categories where slug='tmp'`);
    const r = await admin(`select category_id from menu_items where name='TmpItem'`);
    await admin(`delete from menu_items where name='TmpItem'`);
    return r.rows[0].category_id === null;
  })();
  check('deleting a category orphans items safely (no data loss)', catDelete);

  report();
}

function report() {
  console.log('\n' + out.join('\n'));
  console.log('\n─────────────────────────────────────');
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log('─────────────────────────────────────\n');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error('\n💥 crashed:\n', e); process.exit(1); });
