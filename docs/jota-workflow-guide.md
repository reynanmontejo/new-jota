# Jota Workflows: Clients, Campaigns, Content, Tasks, and Calendar

This guide explains how the main parts of Jota fit together. It separates the
current behavior from the recommended simpler workflow. Recommendations in
this document are not implemented merely by writing this guide.

## The system in one picture

```text
CLIENT
  ├── Platforms the client uses
  ├── CAMPAIGNS (optional grouping for related work)
  │     └── CONTENT ITEMS (planned posts or creative deliverables)
  │            ├── Publish date and work/deadline information
  │            ├── Responsible person
  │            ├── Files and versions
  │            └── Content review and publishing progress
  └── STANDALONE TASKS (work not represented by a calendar post)
         ├── Owner and due date
         ├── Files, comments, and checklist
         └── Task review and completion

CALENDAR = date-based view of existing content and task records
MY WORK  = account-manager client content plus that person's assigned tasks
```

The Calendar and My Work should be views of existing records. They should not
create duplicate copies of the same work.

## What each part means

### Client

A client is the customer account, such as Shark's Tail Dive Resort. It is the
main place for organizing customer work and controlling who can access it. A
client may have multiple account managers, platforms, campaigns, content items,
standalone tasks, and client-level files.

The client's social platforms describe where that client has a presence. A
content item describes a particular piece of work for one or more platforms.

### Campaign

A campaign is a grouping for related work, such as a holiday promotion or a
product launch. It is not a task and does not automatically create tasks.

**Current behavior:** campaigns are managed under one client. Content records
still require a campaign in the database, but the local UI can automatically
create/reuse that client's **General / Ongoing** campaign when no named campaign
is selected. This requires the latest local migration; it is not available in a
hosted workspace until that migration is applied. Standalone tasks may have no
campaign. Draft/Active campaigns can receive new content; paused/closed ones
cannot. Existing content and its review history remain attached.

**Recommendation:** keep campaigns for named projects, but do not make account
managers create or choose a campaign for every ordinary post. Keep the required
relationship for review-history integrity and use the per-client default.

### Content item and Content tracker

A content item is one deliverable from the content calendar: for example,
"Post about beginner diving lessons on Instagram." It records what is being
made, for which client/platform, when it is due or scheduled, the assigned
creator/editor, and its production/review/publishing progress. Client membership
separately determines which account manager owns/follows the client work.

The unified **Content** page is the full list of these records. It is useful for
calendar imports, organization-wide oversight, searching, filtering, and
tracking content across clients. Account Managers and Supervisors now use the
same page instead of separate My Content and Full Tracker destinations.

**Current behavior:** importing a CSV creates content items only; it does not
create task records. Content has a separate status and content-review workflow.
The Content page shows content allowed by client access. My Work shows all
content for the signed-in Account Manager's RLS-authorized clients, even when a
different creator/editor is assigned; Supervisors see content in their
authorized scope. The creator/editor is shown separately on each content card.
New Account Manager items default the creator/editor to the importing/creating
person; Supervisor/Admin imports select a creator/editor for a single-client
import or map the column for multi-client imports. Older `assigned_to` values
remain creator/editor assignments and were not rewritten.

### Task

A task is work assigned to a person that is not already represented by a
calendar content item. Examples include preparing a report, updating brand
guidelines, or handling a one-off request from a supervisor.

A task can have an owner, client, optional campaign, due date, priority, files,
comments, checklist items, and its own review history.

**Current behavior:** tasks and content are separate records with separate
statuses and review workflows. Creating a standalone task does not create a
content item; importing a content item does not create a task. The word "task"
can be confusing because account managers may naturally call each calendar post
a task.

### Calendar

The Calendar is a date-based view of existing work, not a second place where
posts are stored. Currently it can show content publish dates, content
deadlines, and standalone task due dates. It does not use the content `work_date`
field in its calendar query.

Keep the date meanings separate:

- **Publish date:** when the post is planned to go live.
- **Work date:** when production is planned to happen, if provided.
- **Deadline:** when the work needs to be ready.
- **Task due date:** when a standalone assignment is due.

For example, a graphic may be due Wednesday and scheduled to publish Friday.
Those should remain two clearly labeled dates rather than being treated as the
same date. The calendar's primary date for a content post should be its publish
date; deadlines should appear as separately labeled events.

### Files and review

Draft and final files for a calendar post should be attached to that content
item, so the reviewer sees the right deliverable and its version history.
Files for a standalone assignment belong to that task. This keeps each review
history attached to one work record and avoids submitting the same post through
both content review and task review.

## Simple workflow (local UI implementation)

```text
CSV import or Add calendar post
              │
              ▼
        One content item
          ┌───┴────┐
          ▼        ▼
      Calendar   My Work (type: Content)
          └───┬────┘
              ▼
  Create asset → Submit for content review
              → Revise if requested
              → Approve → Publish → Mark published

Supervisor assigns unrelated work
              │
              ▼
        One standalone task
              │
              ▼
       My Work (type: Task)
              │
              ▼
      Submit/review if needed → Complete or cancel
```

The Account Manager sees standalone tasks and calendar content on the My Work
page. When a piece needs direct assignment tracking, use **Add task** on its
content card. The linked task replaces the duplicate content card in that
person's My Work, but the content item remains in Content and on the Calendar.
The Supervisor sees the team content section and task board. Tasks and content
remain different records and retain their appropriate review flows.

## Recommended meaning of the main actions

- **Import calendar:** create one content item for each valid populated CSV row.
  Account Manager imports default the responsible person to the importer;
  Supervisor/Admin imports require a safe owner choice or a mapped owner column.
- **Add content:** create one content item for a single planned post or creative
  deliverable.
- **Add task to content:** create a task linked to the selected content item.
  Its client and campaign are derived from the content record. The task has its
  own owner, progress, and due date; the content keeps its calendar dates,
  files, review, and publishing state.
- **Create standalone task:** create work that is not on the content calendar,
  usually assigned by a supervisor.
- **Submit for content review:** send a specific content-file version to a
  supervisor for a decision.
- **Request changes:** send feedback to the content owner; the next upload is a
  new version.
- **Approve:** approve that submitted version. Approval does not mean the post
  has been published.
- **Mark published:** record that the post actually went live.
- **Complete task:** close a standalone task. It does not approve or publish
  its linked content.
- **Campaign:** group related client work when useful; it does not create work.

## Assignment rule to decide before implementation

Every content item shown in an individual's My Work list needs a reliable
owner. Choose one rule and apply it consistently:

1. Use an assignee column in the CSV when present.
2. If the account manager imports their own calendar, default to that manager.
3. If a supervisor imports content for a client, require an explicit assignee
   when more than one account manager can own it.
4. If no owner can be determined safely, import as unassigned and flag it for
   assignment instead of implying it belongs to someone.

Client access and item assignment are different: being allowed to view a
client's records does not necessarily mean every item belongs to that user.

## Suggested implementation sequence

1. Confirm who owns imported content and how multi-platform rows should be
   represented.
2. Confirm the CSV date mapping: publish date, work date, and deadline.
3. Show assigned content in My Work with a Content label, without creating a
   duplicate task record.
4. Make import mapping and defaults clear; provide a preview that names the
   client, owner, campaign/grouping, platform, and date for each row.
5. Reduce campaign friction without breaking existing content-review links.
6. Keep the content and standalone-task review histories separate, and test
   both paths end to end with account-manager and supervisor roles.

## Example

Suppose the calendar contains "Beginner diving tips" for Shark's Tail:

- The content item appears on the Calendar on its planned publish date.
- If its artwork deadline is earlier, that deadline is shown separately.
- The item appears in the responsible account manager's My Work list as
  **Content**.
- The Canva export is uploaded to the content item and submitted for content
  review.
- After approval, the account manager publishes it and marks it published.
- No second task record is created for the same post.
- If a supervisor separately asks the manager to prepare a monthly report, that
  is a **Task** with its own due date and task workflow.

This structure lets Jota answer three questions clearly:

- **What are we producing?** The content item.
- **Who is responsible for acting on it?** Its assignee, shown in My Work.
- **Where does it belong?** The client, and optionally a campaign grouping.
