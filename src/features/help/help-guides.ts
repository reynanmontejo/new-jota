export type HelpGuideStep = { title: string; body: string }
export type HelpGuideLink = { label: string; href: string }
export type HelpGuide = {
  slug: string
  title: string
  summary: string
  section: "Start here" | "Account managers" | "Supervisors" | "Everyone" | "Administrators"
  audience: string
  minutes: number
  steps: HelpGuideStep[]
  remember: string
  actions: HelpGuideLink[]
  related: string[]
}

export const helpGuideSections: HelpGuide["section"][] = [
  "Start here", "Account managers", "Supervisors", "Everyone", "Administrators",
]

export const recommendedHelpGuideSlugs = [
  "how-jota-fits-together", "create-work-from-client-to-task", "task-board-basics",
] as const

export const helpGuides: HelpGuide[] = [
  {
    slug: "how-jota-fits-together",
    title: "How Jota fits together",
    summary: "Learn what Clients, Campaigns, Content, Tasks, Reviews, and Publishing each mean.",
    section: "Start here", audience: "Everyone", minutes: 3,
    steps: [
      { title: "Start with a client", body: "A client is the account or business the work is for. Client access controls which workspaces and files a teammate can see." },
      { title: "Use a campaign when it helps", body: "A campaign groups work for one client. It is optional; general or ongoing work can use the client’s General / Ongoing grouping." },
      { title: "Put planned posts in Content", body: "A content item represents the post or creative deliverable: what it is, for which client, and when it is due or planned to publish. It remains in Content and Calendar." },
      { title: "Use Tasks for assigned work", body: "A task answers who is doing a piece of work. You can link it to a content item, or create a separate task for work assigned by a supervisor." },
      { title: "Keep the outcomes separate", body: "Review is a decision on submitted files. Task completion records finished work. Publishing records that a post actually went live. One does not automatically mean the others happened." },
    ],
    remember: "A calendar item does not automatically become a task. Choose Add task when assigning and tracking the production work as a task would help.",
    actions: [{ label: "Open Content", href: "/content" }, { label: "Open My Work", href: "/tasks" }],
    related: ["manage-content-calendar", "add-content-as-task", "task-board-basics"],
  },
  {
    slug: "create-work-from-client-to-task",
    title: "From client setup to published content",
    summary: "Follow one complete workflow: client team, optional campaign, static or video content, linked task, review, client decision, and publishing.",
    section: "Start here", audience: "Everyone", minutes: 7,
    steps: [
      { title: "Create or open the client", body: "In Clients, choose an existing client or use Add client if your account has access. An Account Manager who creates a client becomes its primary manager. A Supervisor or Administrator can open the client's Team tab to assign other Account Managers and choose the primary owner. If you cannot see Add client, ask someone with client-management access." },
      { title: "Choose the client's Video Editor", body: "On the client's Team tab, an assigned Account Manager, Supervisor, or Administrator can save one Video Editor for that client. This is a client-level suggestion for video work, not an automatic assignment to every content item or task." },
      { title: "Decide whether a campaign is needed", body: "Use New campaign on the client's Campaigns tab for a specific launch or initiative if your role allows it. Otherwise leave Campaign optional when adding content; Jota uses that client's General / Ongoing grouping. Standalone tasks can also have no client and no campaign." },
      { title: "Plan a static or video content item", body: "In Content, choose Add content. Select the client, enter a title and platform, and use Format for the subtype, such as Static image, Carousel, or Reel. Add the work deadline and planned publish date when known. Choose the creator/editor for this item; a video format suggests the client's Video Editor, but you can change the assignee." },
      { title: "Link a production task when useful", body: "On the saved Content card, choose Add task and confirm its title, owner, priority, and required due date. A Supervisor or Administrator can assign an active team member; an Account Manager creates tasks assigned to themself. Creating content alone does not create a task. Use New task instead for separate work, with client and campaign left blank if unrelated." },
      { title: "Submit the right files for internal review", body: "Upload creative files on the content item and submit a version for supervisor review. If there is a linked task, its owner submits task files through the separate task-review workflow when review is needed. A supervisor reviews the submitted version in Reviews and approves it or requests changes with feedback. Approval of a task does not complete it or approve its linked content." },
      { title: "Send approved content to the client externally", body: "After a content version is approved internally, the assigned Account Manager sends it through the team's usual outside channel. Then open the Content card's More details and choose Mark sent to client. This records the handoff and moves the item to Waiting for client; Jota does not send the files or contact the client." },
      { title: "Record the client's decision", body: "When the client replies outside Jota, the assigned Account Manager opens More details and records Approved, Revisions requested, or Declined. Revisions require feedback, move the content to Revision requested, and return non-archived, non-cancelled linked tasks to To do while keeping their history. Make a new version, repeat internal review, and send the newly approved version again. Client approval stays on the content item; it does not schedule, publish, or complete a task." },
      { title: "Schedule, publish, and finish separately", body: "After client approval, edit the Content item to set its publish date and Scheduled status. Post through the normal social-platform process. When it is live, set the content status to Published in Content; if the scheduled item appears in My Work, its action menu also offers Mark as published. A Supervisor or Administrator completes an approved employee task when its work is finished; they can complete their own primary-assignee task directly without a task review." },
      { title: "Know who owns each handoff", body: "The Account Manager owns client communication, records the external response, and can choose the client's Video Editor. The assigned creator or editor produces the static or video deliverable and submits it for review when available. Supervisors and Administrators manage team assignments, decide internal reviews, and complete employee tasks; Administrators also manage workspace setup. A client does not need a Jota account for this flow." },
    ],
    remember: "Content approval, client approval, task completion, and publishing are separate records. Jota tracks the external client handoff and response; it does not send the creative, receive the response, or publish the post for you.",
    actions: [{ label: "Open Clients", href: "/clients" }, { label: "Open Content", href: "/content" }, { label: "Open My Work", href: "/tasks" }],
    related: ["how-jota-fits-together", "clients-and-campaigns", "manage-content-calendar", "add-content-as-task", "submit-and-revise-work", "supervisor-review", "publish-content"],
  },
  {
    slug: "manage-content-calendar",
    title: "Manage the content calendar",
    summary: "Create planned posts and understand how they appear across Content, Calendar, and My Work.",
    section: "Account managers", audience: "Account managers and supervisors", minutes: 3,
    steps: [
      { title: "Open Content", body: "Use Add content to create one post or creative deliverable. Choose its client, give it a clear title, and fill in the platform, format, and dates available in the form." },
      { title: "Choose dates with different purposes", body: "The work date or deadline helps the team plan production. The publish date is when the post is intended to go live; Calendar can show both." },
      { title: "Track production", body: "Use the content status and next action to record whether the item is planned, in production, in review, scheduled, or published." },
      { title: "Find it in the other views", body: "Content is the tracker, Calendar is the date-based view, and My Work surfaces unlinked content alongside tasks. Adding a task links assigned work without creating a second content item." },
    ],
    remember: "Changing a task status does not automatically publish or approve its linked content. Update each record when that part of the work actually happens.",
    actions: [{ label: "Open Content", href: "/content" }, { label: "Open Calendar", href: "/calendar" }],
    related: ["import-calendar-csv", "add-content-as-task", "publish-content"],
  },
  {
    slug: "import-calendar-csv",
    title: "Import a content calendar from CSV",
    summary: "Prepare a spreadsheet, map its columns, check the preview, and import only valid rows.",
    section: "Account managers", audience: "Account managers and supervisors with content access", minutes: 4,
    steps: [
      { title: "Prepare one row per content item", body: "Use a header row and separate columns for content title or idea, client, campaign, platform, format, work date, publish date, caption or brief, and status when available. Save or export the sheet as CSV." },
      { title: "Choose the CSV in Content", body: "Open Import from CSV and select the file. Jota scans the headers and may suggest matching columns." },
      { title: "Check the mapping and defaults", body: "For each field, select the matching CSV column or a default value. Defaults are useful when every row belongs to the same client, campaign, or platform. Leave optional fields unmapped if the file has no corresponding data." },
      { title: "Resolve preview warnings", body: "Review the preview before importing. It shows which rows are ready, duplicates that will be skipped, and corrections needed, such as a missing title, client, platform, or format." },
      { title: "Import and verify", body: "Import the ready rows, then confirm they appear in Content. Their dates appear in Calendar. Use Add task on an item only when you want assigned work tracked on the task board." },
    ],
    remember: "CSV import creates Content items. It does not create tasks, upload Canva files, or publish posts. Duplicate rows may be skipped.",
    actions: [{ label: "Open Content", href: "/content" }],
    related: ["manage-content-calendar", "add-content-as-task"],
  },
  {
    slug: "add-content-as-task",
    title: "Add calendar content as a task",
    summary: "Link production work to a planned post so it can be assigned and tracked without duplicating the content item.",
    section: "Account managers", audience: "Account managers and supervisors", minutes: 2,
    steps: [
      { title: "Find the content item", body: "On a Content card, choose Add task. If the item appears in My Work, its action menu offers Add as task." },
      { title: "Confirm the task details", body: "The task form is prefilled from the content item with its client, campaign, title, and deadline where available. Confirm the assignee, due date, priority, and title before creating it." },
      { title: "Work from the task", body: "The linked assignment appears on the My Work or Team work board. Open it to add files, notes, checklist items, or submit work for review." },
      { title: "Keep the content record current", body: "The content item stays in Content and Calendar. The task tracks assigned production work; update the content status and publish date separately as needed." },
    ],
    remember: "Use New task for work that is not tied to a calendar post, such as a separate assignment from a supervisor.",
    actions: [{ label: "Open My Work", href: "/tasks" }, { label: "Open Content", href: "/content" }],
    related: ["task-board-basics", "submit-and-revise-work", "how-jota-fits-together"],
  },
  {
    slug: "task-board-basics",
    title: "Use the task board",
    summary: "Find work, open task details, understand statuses, and keep completed work from cluttering the board.",
    section: "Account managers", audience: "Account managers and supervisors", minutes: 4,
    steps: [
      { title: "Find the task", body: "Use Kanban for status columns or List for a compact table. Search and filter by client, status, or priority to narrow the view." },
      { title: "Open task details", body: "Select a card to open its details. The task page contains its owner, due date, checklist, comments, files, submissions, and review history." },
      { title: "Move work through allowed statuses", body: "Typical stages are To do, In progress, For review, Revision, Approved, and Completed. Some transitions are controlled by submitting or reviewing work, so they cannot be dragged manually. A Supervisor or Administrator completes an approved employee task; their own primary-assignee task can be completed directly without review." },
      { title: "Finish or remove work safely", body: "Completed tasks can be moved to Task archive and restored later. Use Trash for mistaken tasks; cancel work that should stop but whose history must remain available." },
    ],
    remember: "Approved is not the same as Completed. An approved employee task still needs a Supervisor or Administrator to mark it complete when the work is finished.",
    actions: [{ label: "Open My Work", href: "/tasks" }, { label: "Open Task archive", href: "/tasks/archive" }, { label: "Open Trash", href: "/tasks/trash" }],
    related: ["submit-and-revise-work", "supervisor-review", "manage-files"],
  },
  {
    slug: "submit-and-revise-work",
    title: "Submit work and handle revisions",
    summary: "Send the right files for review, read the supervisor’s feedback, and submit a new version when changes are needed.",
    section: "Account managers", audience: "Account managers and task owners", minutes: 4,
    steps: [
      { title: "Open the task or content item", body: "Task submissions belong to a task. Content submissions belong to a content item. Open the correct record so reviewers see the right context." },
      { title: "Upload or select the review files", body: "Add the final images, videos, or other deliverables in that record’s file section. Select the files that should be included together in the submission." },
      { title: "Add optional notes and submit", body: "Tell the reviewer what to check, if useful, then submit the selected files. The submission becomes a numbered version that cannot be replaced." },
      { title: "Respond to revision feedback", body: "Open the reviewer’s comments, make the requested changes, upload the revised file as a new version, and submit it again. Previous versions remain in the record." },
    ],
    remember: "Task and content submissions use separate review workflows. A Supervisor or Administrator can complete their own primary-assignee task without task review, but content submissions still require their separate review decision.",
    actions: [{ label: "Open My Work", href: "/tasks" }, { label: "Open Content", href: "/content" }],
    related: ["supervisor-review", "task-board-basics", "manage-files"],
  },
  {
    slug: "supervisor-review",
    title: "Review submitted work",
    summary: "Inspect the exact submitted version, preview files, and approve or request clear changes.",
    section: "Supervisors", audience: "Supervisors and reviewers", minutes: 3,
    steps: [
      { title: "Open Reviews", body: "Choose the task or content submission waiting in the queue. The submission includes its owner, client, version, notes, and the files sent for review." },
      { title: "Preview the files", body: "Review images and supported videos in the page where possible. Use download when you need the original file or a format your browser cannot preview." },
      { title: "Record a decision", body: "Approve work that is ready. If changes are needed, choose Request changes and describe the specific edits before returning it." },
      { title: "Follow the next state", body: "The owner can upload and submit a new version after a revision request. Task approval advances only the task to Approved; content approval restores the content's prior status. Neither review decision completes a task, records client approval, or publishes content." },
    ],
    remember: "Review the submitted version rather than an unrelated file in the client's general files. Supervisor- or Administrator-owned primary tasks bypass task review and can be completed directly; content submissions still use their separate review workflow.",
    actions: [{ label: "Open Reviews", href: "/reviews" }, { label: "Open Team work", href: "/tasks" }],
    related: ["submit-and-revise-work", "publish-content", "task-board-basics"],
  },
  {
    slug: "publish-content",
    title: "Mark content as published",
    summary: "Keep approval, task completion, scheduling, and actual publishing as separate steps.",
    section: "Account managers", audience: "Account managers and supervisors", minutes: 2,
    steps: [
      { title: "Record approval separately", body: "Complete Jota's internal content review when required. If your team gets client approval through another platform, record the response on the content item; Jota does not contact the client." },
      { title: "Publish on the social platform", body: "Jota tracks the content and schedule; the team posts to the selected social platform using its normal publishing process." },
      { title: "Update the content item", body: "When the post is actually live, edit its status to Published in Content. If the scheduled item appears in My Work, its action menu also offers Mark as published. The quick action is available only while its status is Scheduled." },
      { title: "Complete its task separately", body: "If the content has a linked task, a Supervisor or Administrator can mark an approved employee task Completed when assigned work is finished. Their own primary-assignee tasks can be completed directly without task review." },
    ],
    remember: "An approved file is not automatically live. A completed task is not automatically published.",
    actions: [{ label: "Open Content", href: "/content" }, { label: "Open Calendar", href: "/calendar" }],
    related: ["manage-content-calendar", "supervisor-review", "add-content-as-task"],
  },
  {
    slug: "clients-and-campaigns",
    title: "Manage clients and campaigns",
    summary: "Keep client access and work grouping clear without making campaigns an extra requirement for every task.",
    section: "Supervisors", audience: "Supervisors and users with client-management access", minutes: 3,
    steps: [
      { title: "Create or open a client", body: "In Clients, use Add client if your account has permission. Account Managers who create a client become its primary manager. Client records hold the account details, assigned people, platforms, campaigns, tasks, content, and files." },
      { title: "Assign the right people", body: "Assign Account Managers so they can access the client. An assigned Account Manager can select one Video Editor for that client; a Supervisor or Administrator can also change this assignment. Client-level editor assignment does not replace the creator/editor assigned to an individual content item." },
      { title: "Create a campaign only when useful", body: "A campaign belongs to one client and groups related content and work. Leave work under General / Ongoing when it does not need a dedicated campaign." },
      { title: "Pause or archive intentionally", body: "Pause a campaign to stop new content being added while keeping existing records. Archive a client or campaign only when it should leave normal active views." },
    ],
    remember: "A campaign is not a container for multiple clients. Create a separate campaign under each client when needed.",
    actions: [{ label: "Open Clients", href: "/clients" }, { label: "Open Campaigns", href: "/clients?tab=campaigns" }],
    related: ["manage-content-calendar", "manage-files", "task-board-basics"],
  },
  {
    slug: "calendar-overview-insights",
    title: "Use Calendar, Overview, and Insights",
    summary: "Know which dates and metrics belong to planned content and which belong to assigned tasks.",
    section: "Everyone", audience: "Everyone", minutes: 3,
    steps: [
      { title: "Overview is your attention summary", body: "Today’s focus shows active work that still needs attention. Completed and cancelled tasks are kept out of that focus list. Other summary counts and progress may include completed work." },
      { title: "Calendar is date-based", body: "Calendar can show content publish dates and deadlines, plus task due dates. Supervisors can filter calendar content by owner." },
      { title: "Insights is for reviewing trends", body: "Use the filters to review task completion and content counts by Static, Video, and Other, plus published output over time. Content reporting uses the saved publish date; undated items appear only in All dates. Treat Insights as a report, not a place to change records." },
    ],
    remember: "A content publish date and a task due date describe different commitments, even when they fall on the same day.",
    actions: [{ label: "Open Overview", href: "/" }, { label: "Open Calendar", href: "/calendar" }, { label: "Open Insights", href: "/insights" }],
    related: ["manage-content-calendar", "task-board-basics", "how-jota-fits-together"],
  },
  {
    slug: "manage-files",
    title: "Find and manage files",
    summary: "Understand client files, task files, recent files, previews, and safe archiving.",
    section: "Everyone", audience: "Everyone; some management actions require supervisor or administrator access", minutes: 3,
    steps: [
      { title: "Use the right file area", body: "Client files are shared within the client workspace. Task files and content files are attached to their specific work item so submissions and review history stay connected." },
      { title: "Find recent uploads", body: "The Files area shows recent files you can access. Open a file card to preview supported images or videos, or use the file’s details/actions for other formats." },
      { title: "Keep files organized", body: "Use the file actions to download or archive where available. Admin file management provides organization-wide file controls; permanent deletion should be reserved for files that truly must be removed." },
      { title: "Check the connection if upload fails", body: "If Drive uploads fail, verify the workspace’s Drive connection and retry. If the error persists, contact the administrator rather than repeatedly submitting the same file." },
    ],
    remember: "Archiving hides a file from normal views while retaining its stored copy. A task archive is separate and preserves that task’s review history.",
    actions: [{ label: "Open Files", href: "/clients?tab=files" }, { label: "Open Task archive", href: "/tasks/archive" }],
    related: ["submit-and-revise-work", "task-board-basics", "administrator-setup"],
  },
  {
    slug: "profile-and-notifications",
    title: "Profile, settings, and notifications",
    summary: "Update your profile and choose how Jota notifies you on this device.",
    section: "Everyone", audience: "Everyone", minutes: 3,
    steps: [
      { title: "Update your profile", body: "Use Profile to change your display details and profile photo. Password changes depend on your role and the workspace approval process." },
      { title: "Choose appearance and sound", body: "Settings includes the theme and notification sound controls. Sound and volume apply to alerts while Jota is open." },
      { title: "Enable browser notifications", body: "Allow notifications for Jota in your browser when prompted. If permission was denied, change it in the browser’s site settings, then return to Jota and test this device." },
      { title: "Know what browser permission means", body: "Browser permission allows this device to display alerts; it does not guarantee that every notification type is configured or delivered. Keep the app and browser notification settings enabled." },
    ],
    remember: "A teammate’s browser permission is per device/browser. Each user should enable notifications on the computer they use.",
    actions: [{ label: "Open Profile", href: "/profile" }, { label: "Open Settings", href: "/settings" }],
    related: ["administrator-setup", "how-jota-fits-together"],
  },
  {
    slug: "administrator-setup",
    title: "Administrator setup and maintenance",
    summary: "Manage employee access, Drive storage, organization files, and system readiness.",
    section: "Administrators", audience: "Administrators", minutes: 4,
    steps: [
      { title: "Manage the team", body: "Use Employees to provision or manage employee accounts and respond to approved password-change requests. Assign each person the correct role and client access." },
      { title: "Connect file storage", body: "Use File storage settings to connect or inspect the workspace’s Google Drive integration. Uploads and previews depend on a valid connection and the required database setup." },
      { title: "Review organization files", body: "Manage organization uploads from the file-management view. Prefer archive/restore for routine cleanup; permanent deletion is destructive and should be used only when intended." },
      { title: "Check system status", body: "Use the System page for the available read-only checks. A successful reachability check confirms only that specific check; it is not a full backup or data-integrity audit." },
    ],
    remember: "Database migrations are applied in Supabase. If a page reports a missing column, RPC, or migration, apply the named migration before retrying the action.",
    actions: [{ label: "Open Employees", href: "/employees" }, { label: "Open File storage", href: "/settings/storage" }, { label: "Open Manage files", href: "/settings/storage/files" }, { label: "Open System", href: "/admin/system" }],
    related: ["manage-files", "profile-and-notifications", "how-jota-fits-together"],
  },
]

export function getHelpGuide(slug: string) {
  return helpGuides.find((guide) => guide.slug === slug)
}
