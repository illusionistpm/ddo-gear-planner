-- The order the owner arranged their shopping list's route in: packs by
-- name ('' for quests in no pack) and quests by name, as JSON
-- {"packs": [...], "quests": [...]}. NULL while the route is in its
-- default order. Public, like route: a friend's link lists packs and quests
-- in this order too. Written only by the owner (routes/progress.ts).
ALTER TABLE build_progress ADD COLUMN route_order TEXT;
