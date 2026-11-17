-- What the owner's build list shows under each build's name - its weapon and
-- the level range of its gear - as JSON the site works out from the gear
-- when it saves (site/src/app/build/build-gear-summary.ts). Stored, rather
-- than worked out from the blob when the list loads, so the list doesn't
-- carry every build's blob and the game data to read them. Opaque to the
-- Worker, like blob. NULL when the client didn't send one: builds saved
-- before this column existed until they're backfilled, and any save that
-- replaced the blob without one, so a summary never describes old gear.
ALTER TABLE builds ADD COLUMN summary TEXT;
