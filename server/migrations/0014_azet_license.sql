-- AZET Pass: Premium comes from an AZET licence key (suite-api product `pass`).
ALTER TABLE users ADD COLUMN azet_license TEXT;
ALTER TABLE users ADD COLUMN azet_status TEXT;
ALTER TABLE users ADD COLUMN azet_expires_at TEXT;
ALTER TABLE users ADD COLUMN azet_checked_at TEXT;
