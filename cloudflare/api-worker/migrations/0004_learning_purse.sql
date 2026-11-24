-- On-chain learning purse (Soroban) per agent, and the owner key that co-signs approved releases.
ALTER TABLE learning_agents ADD COLUMN purse_id TEXT;
ALTER TABLE learning_agents ADD COLUMN owner_secret_enc TEXT;
-- Optional link from an agent to a logged-in LearnPurse account.
ALTER TABLE learning_agents ADD COLUMN user_id TEXT;
