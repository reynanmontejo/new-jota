import fs from "node:fs/promises"
import assert from "node:assert/strict"

export async function validateProfilePreferences(database, asUser, { manager, administrator, otherUser }) {
  const sql = await fs.readFile("supabase/migrations/202611050003_profile_preferences_and_verified_email.sql", "utf8")
  await database.exec(sql)
  await database.exec(sql)
  const original = (await database.query("select timezone, avatar_url, organization_id from public.profiles where id = $1", [manager])).rows[0]
  const workspace = (await database.query("select timezone from public.organizations where id = $1", [original.organization_id])).rows[0].timezone
  const other = (await database.query("select timezone from public.profiles where id = $1", [otherUser])).rows[0].timezone
  const update = (actor, zone, name = "Profile preference test") => asUser(actor, () => database.query("select public.update_own_profile_preferences($1, 'Designer', $2)", [name, zone]))
  await update(manager, "Asia/Kuala_Lumpur")
  const saved = (await database.query("select display_name, timezone, avatar_url from public.profiles where id = $1", [manager])).rows[0]
  assert.equal(saved.timezone, "Asia/Kuala_Lumpur")
  assert.equal(saved.avatar_url, original.avatar_url, "Preference saving changed the avatar")
  assert.equal((await database.query("select timezone from public.organizations where id = $1", [original.organization_id])).rows[0].timezone, workspace)
  assert.equal((await database.query("select timezone from public.profiles where id = $1", [otherUser])).rows[0].timezone, other)
  await assert.rejects(update(manager, "invalid/zone", "Should not save"), { code: "22023" })
  assert.equal((await database.query("select display_name from public.profiles where id = $1", [manager])).rows[0].display_name, saved.display_name)
  await assert.rejects(update(manager, null), { code: "22023" })
  await asUser(manager, () => database.query("select public.update_own_profile('Legacy profile', 'Designer', '')"))
  assert.equal((await database.query("select timezone from public.profiles where id = $1", [manager])).rows[0].timezone, saved.timezone, "Legacy profile RPC lost the preference")
  await database.query("update public.profiles set status = 'inactive', deactivated_at = now() where id = $1", [manager])
  await assert.rejects(update(manager, "UTC"), { code: "42501" })
  await database.query("update public.profiles set status = 'active', deactivated_at = null where id = $1", [manager])
  assert.equal((await database.query("select has_function_privilege('anon', 'public.update_own_profile_preferences(text,text,text)', 'execute') as allowed")).rows[0].allowed, false)

  const emailBefore = (await database.query("select email from public.profiles where id = $1", [administrator])).rows[0].email
  await database.query("update auth.users set email_change = 'pending@example.test' where id = $1", [administrator])
  assert.equal((await database.query("select email from public.profiles where id = $1", [administrator])).rows[0].email, emailBefore, "Pending address leaked to the profile")
  await database.query("update auth.users set email = 'unconfirmed@example.test', email_confirmed_at = null where id = $1", [administrator])
  assert.equal((await database.query("select email from public.profiles where id = $1", [administrator])).rows[0].email, emailBefore, "Unconfirmed address leaked to the profile")
  await database.query("update auth.users set email = 'verified@example.test', email_change = '', email_confirmed_at = now() where id = $1", [administrator])
  assert.equal((await database.query("select email from public.profiles where id = $1", [administrator])).rows[0].email, "verified@example.test")
  assert.equal((await database.query("select has_function_privilege('authenticated', 'private.sync_verified_profile_email()', 'execute') as allowed")).rows[0].allowed, false)
  await database.exec(sql)
  assert.equal((await database.query("select timezone from public.profiles where id = $1", [manager])).rows[0].timezone, saved.timezone, "Reapplying the migration lost data")
  console.log("Profile preferences validated: personal/tenant isolation, invalid-zone atomicity, legacy RPC compatibility, inactive/anonymous rejection, verified-only email synchronization and idempotence.")
}
