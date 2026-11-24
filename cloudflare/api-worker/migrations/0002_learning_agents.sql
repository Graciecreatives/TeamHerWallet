-- Learning agents: an AI that buys classes for a learner inside rules the owner sets. Stellar Testnet only.
CREATE TABLE IF NOT EXISTS learning_agents (
  id TEXT PRIMARY KEY,
  owner_token_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  learner TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  public_key TEXT NOT NULL UNIQUE,
  secret_enc TEXT NOT NULL,
  policy TEXT NOT NULL,
  network TEXT NOT NULL DEFAULT 'stellar:testnet' CHECK (network = 'stellar:testnet'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id TEXT NOT NULL REFERENCES learning_agents(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  amount REAL,
  course_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS agent_events_agent_idx ON agent_events(agent_id, id);
