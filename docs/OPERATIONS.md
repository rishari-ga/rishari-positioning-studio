# Operations: backup, export, and deletion

Status: Pass 1. Review this before production. Nothing here is a promise to clients until Rishari confirms it on the data-use page.

## Backup and recovery

- **Database:** Render managed PostgreSQL. Backup and point-in-time recovery depend on the database plan you choose in Render. Check your plan's backup terms in the Render dashboard before go-live.
- **Attachments:** stored in your S3-compatible bucket. Turn on bucket versioning or a lifecycle policy if you want recovery from accidental deletion.
- **Test a restore** into a separate database at least once before inviting real clients.

## Export

- Submitted intakes are stored as immutable snapshots in `source_snapshots`. An admin can read any version through `/api/admin/projects/:id/snapshots/:version`.
- Full database export: `pg_dump "$DATABASE_URL" > rishari-backup.sql` from a trusted machine.
- DOCX and Markdown strategy exports arrive in Pass 3.

## Deletion

Not yet available in the admin interface. Until it is, deletion is a manual database task run by Rishari:

- **One attachment:** clients and admins can remove it. The file is deleted from storage immediately. The database row is kept, marked deleted, for the audit trail.
- **A whole project:** `DELETE FROM projects WHERE id = '...'` removes answers, revisions, offers, notes, snapshots, approvals, and attachment records through cascading deletes. Delete the project's files from the bucket separately (prefix `projects/<project id>/`).
- **Derived content** (summaries, flags, drafts from Pass 2 and 3) belongs to the project and is removed with it.
- **Backups:** deleted data can remain in database backups until those backups expire under your Render plan. Say so on the data-use page.
- **Accounts:** removing a user from the app does not delete their Clerk account. Delete them in Clerk too if asked.

## Logging

Server logs record error types only. Request bodies, client answers, and secrets are never logged. The audit table stores identifiers and metadata, never answer text.
