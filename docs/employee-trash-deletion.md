# Permanently delete an employee from Trash

Apply `supabase/migrations/202611040002_employee_trash_delete_now.sql` before deploying the employee deletion button. Applying it does not delete accounts or change the existing 30-day schedule. Existing application versions continue to work.

Administrators with `employees.delete` can open **Employees → Trash → Delete permanently**, type the employee's email, and confirm. A spinner and disabled submit prevent duplicate clicks. The database independently checks administrator access, organization, self/admin protection, Trash state, and the email.

The existing purge process removes the Supabase Auth account and anonymizes the stable profile. Work history keeps its foreign-key references and appears under **Deleted employee**. This does not delete the employee's tasks, comments, review history, or private Drive files. The profile tombstone is intentionally retained; it is no longer a usable account.

Auth deletion, deadline change, anonymization, and audit insertion run in one database transaction. A dependency failure rolls everything back, including the original restore deadline. Retrying a completed deletion is harmless. If the migration is missing, the app reports it and does not delete the account.

Validation: `npm run test:schema` exercises the real SQL in disposable PGlite databases, including failure rollback and history preservation. No hosted data is used.

Rollback the feature by reverting its application commit and running:

```sql
drop function if exists public.admin_permanently_delete_employee(uuid, uuid, text);
```

This removes the new capability; it does not restore accounts already permanently deleted. Existing Trash, Restore, and scheduled expiry remain available.
