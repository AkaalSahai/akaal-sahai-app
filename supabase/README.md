# Database changes

Each change is a `.sql` file in this folder, run once against the live
database (Supabase Dashboard → SQL Editor, or `supabase db query --linked -f`).
There is no migrations table, so the file — committed with the PR that needs
it — is the record of what was run.

## Checklist before running any SQL

Each item comes from something that actually went wrong.

1. **Adding a column with a default to an existing table fills every existing
   row with that default.** `add column created_at timestamptz not null default now()`
   stamped all 869 past registers with the moment it ran (12-10-2026). For a
   timestamp, add the column first, then set the default, so existing rows stay
   empty instead of getting a misleading value:
   ```sql
   alter table t add column created_at timestamptz;
   alter table t alter column created_at set default now();
   ```
2. **Check a function name is free before `create or replace function`.** It
   silently replaces whatever already has that name:
   ```sql
   select proname from pg_proc where proname = 'my_function';
   ```
3. **Never link history tables to `users` with `on delete cascade` or
   `set null`.** Deleting a leaver would delete or blank their history. Keep the
   user ID; names come from `users` or `get_former_staff()` (see
   `keep-history-when-staff-leave.sql`). Add any new personal-data table to
   `erase_former_staff()`.
4. **pg_cron runs in GMT.** For a UK-time job, run it every 15 minutes across
   the window and check `now() at time zone 'Europe/London'` inside the function
   (see `fix-auto-submit-uk-time.sql`).
5. **Back up the rows you're about to change, wrap the change in
   `begin; … commit;`, end with a `select` showing the expected result, and
   write the undo steps in the file's header.**
6. **Preview first.** Run the `where` clause as a `select count(*)`, and check
   it matches what you expect before running the `update`/`insert`/`delete`.
