-- Provider-neutral PostgreSQL. Run via npm run db:migrate, never on request paths.
-- Authorization belongs to authenticated server services. No browser DB access.
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) <= 320),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 100),
  role text NOT NULL CHECK (role IN ('creator', 'student')),
  stellar_public_address text CHECK (stellar_public_address ~ '^G[A-Z2-7]{55}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE CHECK (octet_length(token_hash) = 32),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry_idx ON auth_sessions(expires_at);

CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id),
  slug text UNIQUE,
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 5000),
  target_audience text NOT NULL DEFAULT '' CHECK (length(target_audience) <= 500),
  duration text NOT NULL DEFAULT '' CHECK (length(duration) <= 100),
  category text NOT NULL DEFAULT '',
  learning_objectives jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(learning_objectives) = 'array'),
  price_units bigint CHECK (price_units > 0),
  capacity bigint CHECK (capacity BETWEEN 1 AND 4294967295),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'registering', 'published', 'inactive')),
  network text NOT NULL DEFAULT 'TESTNET' CHECK (network = 'TESTNET'),
  asset_address text,
  recipient_address text,
  course_id_hash text UNIQUE,
  metadata_hash text,
  contract_tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'published' OR (length(trim(title)) >= 5 AND price_units IS NOT NULL AND slug IS NOT NULL AND asset_address IS NOT NULL AND recipient_address IS NOT NULL AND course_id_hash IS NOT NULL AND contract_tx_hash IS NOT NULL))
);
CREATE INDEX courses_creator_idx ON courses(creator_id);
CREATE INDEX courses_status_idx ON courses(status);

CREATE TABLE course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '' CHECK (length(title) <= 100),
  description text NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  UNIQUE (course_id, sort_order)
);

CREATE TABLE lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  visibility text NOT NULL DEFAULT 'protected' CHECK (visibility IN ('preview', 'protected')),
  UNIQUE (module_id, sort_order)
);

CREATE TABLE purchase_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  student_id uuid NOT NULL REFERENCES users(id),
  student_address text NOT NULL,
  expected_amount bigint NOT NULL CHECK (expected_amount > 0),
  asset_address text NOT NULL,
  recipient_address text NOT NULL,
  network text NOT NULL CHECK (network = 'TESTNET'),
  state text NOT NULL DEFAULT 'created' CHECK (state IN ('created', 'payment_required', 'settlement_pending', 'settled', 'registry_pending', 'active', 'failed', 'expired', 'cancelled', 'reconciliation_required', 'revoked')),
  idempotency_key text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX purchase_intents_student_idx ON purchase_intents(student_id);
CREATE INDEX purchase_intents_course_idx ON purchase_intents(course_id);
CREATE INDEX purchase_intents_reconciliation_idx ON purchase_intents(state, updated_at);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_intent_id uuid NOT NULL UNIQUE REFERENCES purchase_intents(id),
  tx_hash text NOT NULL UNIQUE,
  payment_reference text NOT NULL UNIQUE,
  amount_units bigint NOT NULL CHECK (amount_units > 0),
  asset_address text NOT NULL,
  network text NOT NULL CHECK (network = 'TESTNET'),
  facilitator_status text NOT NULL,
  settled_at timestamptz,
  raw_response jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE onchain_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL UNIQUE REFERENCES payments(id),
  course_id uuid NOT NULL REFERENCES courses(id),
  student_address text NOT NULL,
  contract_tx_hash text UNIQUE,
  registry_status text NOT NULL DEFAULT 'pending' CHECK (registry_status IN ('pending', 'confirmed', 'failed', 'revoked')),
  recorded_at timestamptz,
  CHECK (registry_status <> 'confirmed' OR (contract_tx_hash IS NOT NULL AND recorded_at IS NOT NULL))
);
CREATE INDEX onchain_purchases_course_idx ON onchain_purchases(course_id);

CREATE TABLE enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id),
  student_id uuid NOT NULL REFERENCES users(id),
  payment_id uuid NOT NULL UNIQUE REFERENCES payments(id),
  status text NOT NULL CHECK (status IN ('pending', 'active', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, student_id)
);
CREATE INDEX enrolments_student_idx ON enrolments(student_id);

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_entity_idx ON audit_events(entity_type, entity_id, created_at);
