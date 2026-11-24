ALTER TABLE profiles
  ADD COLUMN focus text NOT NULL DEFAULT '' CHECK (length(focus) <= 100);
