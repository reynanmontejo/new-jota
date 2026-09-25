# UX foundation

## Primary workflow

The first product slice follows one traceable path:

`Client → Campaign → Content item → Task → Work upload → Submission → Review → Completion`

Content items own publish dates. Tasks own due dates. Submission versions own review decisions. The interface must keep those concepts distinct.

## Initial role experience

The first implemented dashboard represents an Account Manager. It prioritizes work requiring action today, revision requests, content publishing dates, and fast access to assigned clients. Supervisor and Administrator navigation will use the same shell with permission-driven destinations and role-specific home content.

## Navigation model

- **Work:** Overview, My tasks, Calendar, Campaigns, Files
- **Workspace:** Clients, Company tools
- **Utilities:** Help center, Settings
- **Global actions:** Search, create task, notifications, profile

Client workspaces will use local tabs for Overview, Calendar, Tasks, Campaigns, Files, Team, and Activity. Users should always understand whether they are operating at organization, client, campaign, or task level.

## Status language

Task statuses are `To do`, `In progress`, `In review`, `Changes requested`, `Done`, and `Cancelled`.

Submission versions use `Draft`, `Submitted`, `Changes requested`, and `Approved`. Approval is shown as a submission outcome; task completion remains the task outcome.

## Interface principles

- Lead with urgency and ownership rather than raw record counts.
- Use color as reinforcement, never as the only status signal.
- Keep the most frequent action visible and place secondary actions in contextual menus.
- Preserve client and campaign context in task and review rows.
- Provide explicit loading, empty, error, access-denied, and inactive-user states.
- Keep desktop layouts dense enough for operations while retaining comfortable touch targets on tablet and mobile.

## Visual direction

The visual system uses a restrained isometric treatment inspired by floating physical interface tiles. Warm off-white surfaces, bronze, sand, and honey accents, translucent layers, soft gradients, and directional shadows create depth without changing the information hierarchy. Perspective is intentionally subtle so operational text remains easy to scan. Motion and hover lift are disabled for users who prefer reduced motion, and mobile layouts flatten the strongest perspective effects.

The core palette is `#141311` for text, `#fdfcfb` for the background, `#af8653` for primary actions, `#debe97` for secondary surfaces, and `#e0aa66` for accents. Transparent layers, shadows, and gradients are derived from those colors.

## Responsive behavior

- The sidebar remains visible on desktop and moves into a modal sheet on smaller screens.
- Summary cards collapse from four columns to two and then one.
- Task metadata wraps below the title on narrow screens.
- Secondary status badges may be hidden on narrow screens, while due time and urgency remain visible.
- The right dashboard rail stacks below the task list on smaller screens.

## Completed vertical-slice deliverables

The mocked client workspace, task detail, immutable version history, submission
flow, supervisor review queue, review decisions, and shared interface states are
implemented. See `docs/vertical-slice-ux.md` for the walkthrough and limitations.

## Next UX deliverables

1. Authentication and protected-route states.
2. Permission-aware navigation using real profile data.
3. Administrator member, team, and client-assignment flows.
