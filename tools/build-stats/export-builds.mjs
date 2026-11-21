#!/usr/bin/env node
// Exports every saved build and share link from the production D1 database into
// tools/build-stats/builds.local.json, for the suggestion evaluation harness
// (site/src/app/suggestion-eval). See README.md in this folder.
//
// What it keeps: each build's codec blob, its name, its timestamps, and a
// pseudonym for its owner ("u1", "u2", ... in order of first appearance) so the
// analysis can weight players rather than builds. It never reads users.email or
// users.display_name, and the owner ids themselves don't leave this script.
//
// Usage, from the repository root, after `npx wrangler login` in worker/:
//   node tools/build-stats/export-builds.mjs            # names included
//   node tools/build-stats/export-builds.mjs --no-names # names dropped
//   node tools/build-stats/export-builds.mjs --local    # against `wrangler dev`'s local D1

import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workerDir = join(here, '..', '..', 'worker');
const outFile = join(here, 'builds.local.json');
const keepNames = !process.argv.includes('--no-names');
const target = process.argv.includes('--local') ? '--local' : '--remote';

function query(sql) {
  const raw = execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', target, '--json', '--command', sql], {
    cwd: workerDir,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  // wrangler prints an array with one result set per statement.
  const parsed = JSON.parse(raw);
  const results = Array.isArray(parsed) ? parsed[0]?.results : parsed.results;
  if (!Array.isArray(results)) {
    throw new Error('Unexpected wrangler output: ' + raw.slice(0, 500));
  }
  return results;
}

const pseudonyms = new Map();
function pseudonym(ownerId) {
  if (!pseudonyms.has(ownerId)) {
    pseudonyms.set(ownerId, 'u' + (pseudonyms.size + 1));
  }
  return pseudonyms.get(ownerId);
}

const builds = query(
  'SELECT owner_user_id, name, blob, created_at, updated_at FROM builds ORDER BY created_at'
).map(row => ({
  source: 'saved',
  owner: pseudonym(row.owner_user_id),
  name: keepNames ? row.name : undefined,
  blob: row.blob,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
}));

// Share links are anonymous snapshots; many duplicate a saved build's gear, so
// drop those whose blob a saved build already has.
const savedBlobs = new Set(builds.map(build => build.blob));
const shares = [];
for (const row of query('SELECT blob, created_at FROM shortlinks ORDER BY created_at')) {
  let envelope;
  try {
    envelope = JSON.parse(row.blob);
  } catch {
    continue;
  }
  if (!envelope?.blob || savedBlobs.has(envelope.blob)) {
    continue;
  }
  savedBlobs.add(envelope.blob);
  shares.push({
    source: 'share',
    owner: null,
    name: keepNames ? envelope.name : undefined,
    blob: envelope.blob,
    createdAt: row.created_at,
    updatedAt: row.created_at,
  });
}

const all = [...builds, ...shares];
writeFileSync(outFile, JSON.stringify({ exportedAt: new Date().toISOString(), builds: all }, null, 1));
console.log(`Wrote ${builds.length} saved builds (${pseudonyms.size} owners) and ${shares.length} distinct share links to ${outFile}`);
