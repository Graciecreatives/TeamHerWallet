-- LearnPurse on Cloudflare D1 (SQLite). Stellar Testnet only.
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('creator', 'student')),
  focus TEXT NOT NULL DEFAULT '',
  wallet_address TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  creator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  creator_name TEXT NOT NULL,
  pay_to TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT 'creator-home',
  accent TEXT,
  tagline TEXT,
  draft TEXT NOT NULL,
  payment_policy TEXT NOT NULL DEFAULT '{"mode":"single"}',
  network TEXT NOT NULL DEFAULT 'TESTNET' CHECK (network = 'TESTNET'),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS courses_pay_to_idx ON courses(pay_to);
CREATE INDEX IF NOT EXISTS courses_created_idx ON courses(created_at);

CREATE TABLE IF NOT EXISTS enrolments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  student TEXT NOT NULL,
  tx_hash TEXT NOT NULL UNIQUE,
  network TEXT NOT NULL,
  enrolled_at TEXT NOT NULL,
  access_token TEXT NOT NULL,
  payment_number INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS enrolments_course_idx ON enrolments(course_id);
CREATE INDEX IF NOT EXISTS enrolments_student_idx ON enrolments(course_id, student);
CREATE INDEX IF NOT EXISTS enrolments_token_idx ON enrolments(access_token);
