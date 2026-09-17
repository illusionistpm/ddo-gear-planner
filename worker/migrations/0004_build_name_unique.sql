-- Enforces server-side what the client already tries to check client-side
-- (BuildActionsComponent's duplicate-name guard on both create and rename)
-- - that check is racy (two tabs, or a direct API call, bypass it
-- entirely; onDialogConfirmed even deliberately proceeds with the save if
-- the check itself fails). COLLATE NOCASE matches the client's own
-- case-insensitive comparison. No TRIM() needed: validateName() in
-- routes/builds.ts already trims before a row is ever written, so stored
-- names are guaranteed pre-trimmed.
CREATE UNIQUE INDEX idx_builds_owner_name ON builds(owner_user_id, name COLLATE NOCASE);
