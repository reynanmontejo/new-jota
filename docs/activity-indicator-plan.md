# Planned activity indicator

Status: planned only. No interface, query, or schema change is included in this phase.

## Goal

Add a compact GitHub-style daily activity grid to Insights so a person can see when content and task work happened. It should help identify quiet periods and workload patterns without implying that more clicks mean better work.

## Proposed behavior

- Show the last 12 weeks by day, with a legend for zero, low, medium, and high activity. Use readable counts and dates on hover, focus, and touch.
- Count meaningful events: task creation, progress/status changes, submissions, reviews, content creation, and content workflow changes. Exclude passive page views, notification reads, and repeated realtime refreshes.
- Offer **My activity** and, for authorized supervisors or administrators, **Team activity**. Apply the same client and user access rules as Insights before aggregation.
- Let a day open a filtered event list; include task/content links only when the viewer can access them.
- Aggregate once per request or from a maintained daily summary if querying the existing activity log proves too slow. Do not fetch every raw event into the browser.

## Before implementation

1. Audit `activity_logs` and content review/history tables to confirm each proposed event has a reliable timestamp, actor, organization, and permission boundary. Define how bulk imports count and deduplicate retries.
2. Agree on the event weights (initially one event per meaningful action) and timezone (Asia/Manila for day boundaries).
3. Measure the aggregate query on staging with realistic data. Add an index or daily summary only if needed.
4. Test role visibility, empty days, accessibility without color, and behavior with large histories.
