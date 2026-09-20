#!/usr/bin/env node
/**
 * Fails if component CSS contains a colour literal.
 *
 * Colours belong in src/styles.css as per-theme tokens (see CLAUDE.md). A
 * literal in a component stylesheet is a light-mode value that silently leaks
 * into dark mode - the bug the 2026 token sweep removed from ~97 places.
 * Nothing but this check stops the next one.
 *
 * Allowed: var(--token), rgba(var(--token-rgb), a), and translucent white
 * overlays on filled buttons (rgba(255, 255, 255, a)).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src', 'app');
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNCTIONAL = /\b(?:rgba?|hsla?)\(\s*(?!var\(|255\s*,\s*255\s*,\s*255\s*[,)])[^)]*\d/;

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

const offenders = [];
for (const file of cssFiles(ROOT)) {
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const code = line.split('/*')[0];
    if (HEX.test(code) || FUNCTIONAL.test(code)) {
      offenders.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (offenders.length) {
  console.error('Colour literals in component CSS (use a token from src/styles.css - see CLAUDE.md):\n');
  offenders.forEach(line => console.error('  ' + line));
  console.error(`\n${offenders.length} literal(s) found.`);
  process.exit(1);
}
console.log('No colour literals in component CSS.');
