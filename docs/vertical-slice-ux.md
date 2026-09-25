# First vertical-slice UX

The mocked workflow is intentionally implemented before database-backed mutations.
State is shared through `WorkflowProvider` for client-side route transitions and
resets on a full browser reload.

## Walkthrough

1. Open `/clients/luma-skincare` and move through Overview, Campaigns, Content
   calendar, Tasks, Files, Team, and Activity.
2. Open a task from the client workspace or `/tasks`.
3. Update status, complete checklist items, and add comments.
4. Use `upload-carousel-design-v2` to see revision feedback and immutable V1
   history. A file under 10 MB creates the next draft version; larger files show
   the failure state.
5. Submit the latest draft for review. Client-side navigation to `/reviews` keeps
   that submission in the shared queue.
6. In `/reviews`, inspect the preview, download a mock review copy, approve the
   version, or request a revision with required feedback.

The review surface compares the reviewer and submitter IDs and disables decisions
for self-review. Phase 5 must enforce the same rule on the server and in RLS-aware
mutation functions.

## Routes

- `/clients/[clientId]` — client workspace and seven local tabs
- `/tasks` — cross-client assignment list
- `/tasks/[taskId]` — task details and submission history
- `/reviews` — supervisor review queue and decision surface
- `/states` — shared state component gallery
- `/access-denied` — permission failure
- `/account-deactivated` — inactive account state

## Implemented states

Loading, empty, error, access denied, account deactivated, upload progress, upload
completion, and upload failure share the same visual language. The application
also provides global `loading.tsx` and `error.tsx` boundaries.

## Mock limitations

- File contents are not uploaded; only browser file metadata is retained.
- The review download is a generated text placeholder.
- State is held in memory and resets on a full reload.
- Authentication, server authorization, RLS policies, Google Drive calls, and
  database persistence belong to later phases.
