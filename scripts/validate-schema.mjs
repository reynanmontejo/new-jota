import fs from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"

const migrationPath = "supabase/migrations/202609250001_initial_schema.sql"
const seedPath = "supabase/seed.sql"

const database = new PGlite()
let migration = await fs.readFile(migrationPath, "utf8")

// PGlite validates PostgreSQL DDL locally but does not bundle Supabase's citext
// extension. Supabase applies the unchanged migration with citext enabled.
migration = migration
  .replace(/create extension if not exists pgcrypto;\s*/i, "")
  .replace(/create extension if not exists citext;\s*/i, "")
  .replace(/\bcitext\b/gi, "text")

await database.exec("create schema auth; create table auth.users (id uuid primary key);")
await database.exec(migration)

const seed = await fs.readFile(seedPath, "utf8")
await database.exec(seed)
await database.exec(seed)

const tableResult = await database.query(
  "select count(*)::int as count from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
)
const taskResult = await database.query("select count(*)::int as count from public.tasks")
const rlsResult = await database.query(`
  select count(*)::int as count
  from pg_class relation
  join pg_namespace namespace on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relkind = 'r'
    and not relation.relrowsecurity
`)

const tableCount = tableResult.rows[0]?.count
const taskCount = taskResult.rows[0]?.count
const tablesWithoutRls = rlsResult.rows[0]?.count

if (tableCount !== 29) {
  throw new Error(`Expected 29 public tables, found ${tableCount}`)
}

if (taskCount !== 3) {
  throw new Error(`Seed should remain idempotent with 3 tasks, found ${taskCount}`)
}

if (tablesWithoutRls !== 0) {
  throw new Error(`Unexpected RLS coverage: ${tablesWithoutRls} unchecked table(s)`)
}

console.log(`Schema validated: ${tableCount} tables, ${taskCount} seed tasks, RLS enabled.`)
await database.close()
