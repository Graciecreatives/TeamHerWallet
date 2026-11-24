-- Application-owned authentication credentials. Passwords are stored only as scrypt hashes.
ALTER TABLE users
  ADD COLUMN password_hash text;

ALTER TABLE users
  ADD CONSTRAINT users_password_hash_check
  CHECK (password_hash IS NULL OR length(password_hash) BETWEEN 80 AND 200);
