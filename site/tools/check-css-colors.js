#!/usr/bin/env node
/**
 * Fails if component CSS contains a color literal.
 *
 * Colors belong in src/styles.css as per-theme tokens (see CLAUDE.md). A
 * literal in a component stylesheet is a light-mode value that silently leaks
 * into dark mode - the bug the 2026 token sweep removed from ~97 places.
 * Nothing but this check stops the next one.
 *
 * Allowed: var(--token), rgba(var(--token-rgb), a), and translucent white
 * overlays on filled buttons (rgba(255, 255, 255, a)). Named colors ("red") count as
 * literals.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src', 'app');
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const FUNCTIONAL = /\b(?:rgba?|hsla?)\(\s*(?!var\(|255\s*,\s*255\s*,\s*255\s*[,)])[^)]*\d/;
// Named colors ("color: red") are literals too. Only the values of color-bearing
// properties are tested, with var() and url() taken out, so a selector, a property like
// white-space or a token's name can't match.
const NAMED = new RegExp('\\b(?:' + 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' ').join('|') + ')\\b', 'i');
const COLOR_PROPERTY = /(?:^|[\s{;])((?:background|border|outline|text-decoration|column-rule)(?:-[a-z]+)*|color|fill|stroke|box-shadow|text-shadow|caret-color|accent-color)\s*:\s*([^;{}]*)/gi;
function hasNamedColor(code) {
  for (const [, , value] of code.matchAll(COLOR_PROPERTY)) {
    if (NAMED.test(value.replace(/var\([^)]*\)/g, '').replace(/url\([^)]*\)/g, ''))) return true;
  }
  return false;
}

function cssFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return cssFiles(full);
    return entry.name.endsWith('.css') ? [full] : [];
  });
}

const offenders = [];
for (const file of cssFiles(ROOT)) {
  // Block comments blanked out (newlines kept, so line numbers hold): prose may name a color.
  const source = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '));
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  source.split('\n').forEach((code, i) => {
    const line = lines[i];
    if (HEX.test(code) || FUNCTIONAL.test(code) || hasNamedColor(code)) {
      offenders.push(`${path.relative(ROOT, file).replace(/\\/g, '/')}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (offenders.length) {
  console.error('Color literals in component CSS (use a token from src/styles.css - see CLAUDE.md):\n');
  offenders.forEach(line => console.error('  ' + line));
  console.error(`\n${offenders.length} literal(s) found.`);
  process.exit(1);
}
console.log('No color literals in component CSS.');
