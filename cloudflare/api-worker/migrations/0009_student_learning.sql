-- Account-scoped learner state. Apply after 0008_student_library.sql.
CREATE TABLE student_chat_messages (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL CHECK(length(id) BETWEEN 41 AND 46),
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 12000 AND (role != 'user' OR length(content) <= 2000)),
  courses TEXT CHECK(courses IS NULL OR (json_valid(courses) AND json_type(courses) = 'array' AND json_array_length(courses) <= 4 AND length(courses) <= 32000)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, id)
);
-- SQLite secondary indexes include rowid, allowing per-account newest-first reads.
CREATE INDEX student_chat_user_idx ON student_chat_messages(user_id);

CREATE TABLE student_module_progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_index INTEGER NOT NULL CHECK(typeof(module_index) = 'integer' AND module_index >= 0 AND module_index <= 9007199254740991),
  completed_at TEXT NOT NULL,
  PRIMARY KEY(user_id, course_id, module_index)
);
CREATE INDEX student_progress_course_idx ON student_module_progress(course_id);

CREATE TABLE student_notification_reads (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_id TEXT NOT NULL CHECK(length(notification_id) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(user_id, notification_id)
);
