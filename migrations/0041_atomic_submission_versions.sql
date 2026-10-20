-- A teacher must evaluate the exact submission they read, not a later resubmission.
BEGIN;
ALTER TABLE atomic_progress ADD COLUMN submission_version INTEGER NOT NULL DEFAULT 1 CHECK(submission_version>0);
ALTER TABLE atomic_task_submissions ADD COLUMN submission_version INTEGER NOT NULL DEFAULT 1 CHECK(submission_version>0);
COMMIT;
