-- Demand from learning agents: what learners want that no class offers yet.
CREATE TABLE IF NOT EXISTS class_requests (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES learning_agents(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  learner TEXT NOT NULL DEFAULT '',
  brief TEXT NOT NULL,
  max_price REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fulfilled', 'closed')),
  course_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS class_requests_status_idx ON class_requests(status, created_at);
