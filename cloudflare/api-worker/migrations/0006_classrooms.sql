CREATE TABLE IF NOT EXISTS classroom_settings (
  course_id TEXT PRIMARY KEY REFERENCES courses(id) ON DELETE CASCADE,
  settings TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS classroom_messages (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student TEXT NOT NULL,
  author TEXT NOT NULL CHECK(author IN ('teacher','student')),
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS classroom_thread_idx ON classroom_messages(course_id, student, created_at);
