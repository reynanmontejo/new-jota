# Easy client ownership test

This checks that an Account Manager can add a client and choose its social
platforms, the manager's name is shown, and a Supervisor can see, monitor, and
assign one or more Account Managers to it.

Words used below:

- **Supabase** is where the app's accounts and saved information live.
- A **migration** is a database update file. The update must be run once before
  the new behavior can work.
- A **smoke test** is a short set of checks to make sure the main feature works.

## Part 1 — Apply the database update once

Do this only in the Supabase project you intend to test. If you have a separate
test project, use that. If you have only one project and it contains real work,
pause before creating sample clients: the tests save data to that project.

1. In your code editor, open this file:
   `supabase/migrations/202610090001_client_trash_and_status.sql`
2. Copy all of its contents.
3. Open Supabase in your browser and select the correct project.
4. In the left menu, open **SQL Editor**. Click **New query** (the plus button).
5. In the query box, type `reset role;` on the first line. Paste the copied
   migration underneath it. `reset role;` returns the SQL Editor to its normal
   database-owner role if an earlier query left it running as `authenticated`.
6. Click **Run** once. A successful result may say “Success. No rows returned”;
   this migration changes database behavior rather than returning a table.
7. If you see an error, stop there. Don’t try random `GRANT` statements or run
   the migration repeatedly. Save the error text or screenshot and ask for help.

This is a new migration and must be run after
`202610080001_account_manager_client_ownership.sql`. If that earlier migration
has not succeeded on this project, apply it first. The new migration has not
been applied to the hosted project by this code change. Do not run either
migration again after it succeeds.

## Part 2 — Check Account Manager can add and own a client

1. Make sure the app is using the same Supabase project you updated. The local
   app is normally at `http://localhost:3000`. Never share `.env.local` or its
   keys; if unsure which project it uses, ask for help before creating records.
2. Sign in as a user whose role is **Account Manager**. If you’re not sure of
   the role, an administrator can check it in the app’s **Employees** section.
3. Open **Clients**, click **Add client**, and enter an obviously test-only
   name, for example `SMOKE TEST - Manager One - 2026-10-05`. Select a few
   social platforms (for example Instagram and TikTok), then submit once.
4. The app should open the new client and show **Client added**.
5. Open the client’s **Team** tab. Your signed-in Account Manager should appear
   as the **Primary** `account_manager`.
6. Go back to **Clients**. The client card should say **Account manager:**
   followed by your name. Refresh the page; the client and name should remain.
7. Use the search box to search for your name. The test client should appear.
   Search for `TikTok` too; the client should also appear.
8. Try adding the same client name one more time. The app should show a
   duplicate warning and should not create a second copy.

If the client is created but your name is missing, stop and report that. Don’t
create more sample clients.

## Part 3 — Check Supervisor can see and monitor it

1. Sign out of the Account Manager account.
2. Sign in as a user whose role is **Supervisor**.
3. Open **Clients**. The test client should appear even though this supervisor
   did not create it.
4. The client card should show the Account Manager’s name. Search for that
   manager’s name; the client should appear in the results.
5. Open the client. Its workspace should load. Check the **Team** tab for the
   same Primary Account Manager, then check the campaign/task counts and
   progress that are available for that client.
6. On that Team tab, add a second active Account Manager and select which one is
   primary. Save. Both names should appear on the client, and the selected
   primary manager should be shown on its directory card. Repeat with only the
   original manager selected to restore the test assignment.

The supervisor should be able to see all organization clients. They do not need
to be individually assigned to each client to monitor progress.

## Part 4 — Check one manager cannot see another manager’s client

This part is optional if you have a second Account Manager test account.

1. Sign out and sign in as Account Manager Two, who did not create or get
   assigned to the test client.
2. Open **Clients** and search for the test client.
3. It should not appear. If you open its exact link, its client details should
   not be shown.

## What counts as success

- Account Manager can add a client.
- The creator is saved as its Primary Account Manager.
- The owner name appears on the client card and can be searched.
- Supervisor can see the client, its owner, and available progress.
- Supervisor can assign multiple Account Managers and choose one primary owner.
- Social platform values are visible and searchable.
- The assigned Account Manager can change their client's status.
- A Supervisor can move a client to Trash and restore it; the linked campaign
  and the client's previous status remain intact.
- An Account Manager cannot move a client to Trash, and trashed clients are not
  visible in their active client directory.
- No permanent delete or 30-day purge runs.
- An unrelated Account Manager cannot see that client's details.
- Refreshing does not lose the new client or owner.

Write down each result as **Pass** or **Fail**. Keep the clearly named test
client until testing is complete. If this is your real/live project, do not
delete or change the test client without first confirming it contains no real
work.
