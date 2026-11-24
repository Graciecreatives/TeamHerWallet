-- Student library: enrolments link back to the signed-in student account when one exists.
ALTER TABLE enrolments ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS enrolments_user_idx ON enrolments(user_id);
