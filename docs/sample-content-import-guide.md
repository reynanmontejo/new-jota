# Test the content-calendar CSV import

Use [`sample-content-import.csv`](./sample-content-import.csv) to test the
import preview and confirm that imported posts appear in Content and Calendar.
Import does not create tasks automatically; use **Add task** on a content card
when that post needs separately assigned work in My Work.

## Before importing

- Prefer a local or staging workspace. If you test in a shared/production
  workspace, use a clearly named test client and campaign, and remove the test
  items through the supported archive action afterward.
- The sample deliberately leaves **Client** and **Campaign** out of the file.
  Select the test client in the import form. Leave Campaign as **General / Ongoing
  (automatic)**, or optionally choose one of that client's Draft or Active
  campaigns. Paused or closed campaigns are unavailable for new content.
  The app creates the default campaign on the first import if needed.
- An Account Manager import defaults the creator/editor to that manager.
  A Supervisor/Admin should choose a creator/editor for the selected client;
  multi-client files should include an `Assigned creator / editor` column.
- The titles start with `TEST -` so the sample rows are easy to find and avoid
  collisions with ordinary posts.

## Import steps

1. Open **Content** and expand **Import from CSV**.
2. Choose `sample-content-import.csv`.
3. Confirm the detected columns. The ordinary column mapping is collapsed under
   **Advanced column mapping**; open it only if the preview is incorrect.
4. Select the test client. Keep **General / Ongoing (automatic)** or optionally
   choose a named Draft or Active campaign. Confirm the platform, format, publish date,
   work date, deadline, and caption in the preview.
5. Confirm the assigned creator/editor. An Account Manager import defaults this
   to the importing manager; a Supervisor/Admin chooses a client member. My
   Work visibility follows client access, not this creator/editor field.
6. Make sure all three rows say **Ready**, then import once.

## Verify the result

- The Content page shows three new `TEST -` rows, each linked to the chosen
  client and campaign.
- The Calendar places each post on its **Publish date** and shows its **Deadline**
  as a separately labeled date. The sample also includes a **Work date**; it is
  retained on the content item but is not currently a Calendar event.
- In My Work, unlinked content appears under **Content from the calendar**.
  After using **Add task**, the linked task appears there instead, with a link
  back to its content item.
- No duplicate row appears in the standalone task board. Content files and
  content review remain attached to the content item.
- Importing the same CSV a second time should report duplicates instead of
  creating a second copy.

The sample dates are October 20, 23, and 26, 2026. Change them if testing after
those dates or if the workspace uses different content scheduling dates.
