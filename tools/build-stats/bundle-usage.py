"""How saved builds use the affix bundles: what people drop from them, and what they add.

Reads the export (export-builds.mjs) and the bundle definitions' git history, so each build is
compared with the bundles as they were when it was created: a build saved before an affix joined a
bundle can't be faulted for lacking it, and if it tracks it anyway, someone added it by hand.

For each bundle (Basic, Melee, Ranged, Caster, Trapping, and the spell power ones):
  - adopters: builds tracking at least ADOPT of the bundle's distinctive affixes (those no other
    bundle had at the time; all of them if it has fewer than two), as the bundle was when the build
    was created. Melee and Ranged share most of their affixes, so without this every melee build
    "adopts" Ranged too. The distinctive affixes' own kept rates are inflated by that choice;

  - per affix of the bundle (current or past): among adopters whose version had it, the share still
    tracking it (low = people remove it); among adopters whose version lacked it, the share tracking
    it anyway (high = people added it by hand before the bundle did);
  - the affixes adopters track most that no bundle they adopted contains (candidates to add).
With a real-builds.spec.ts report (--coverage report.json), it also shows, per affix, how often
finished endgame builds that track it actually cover its main bonus type at 3/4 of best or more.

Usage, from the repository root:
  python3 tools/build-stats/bundle-usage.py tools/build-stats/builds.local.json [--coverage report.json]
"""
import base64
import collections
import json
import re
import subprocess
import sys
import zlib

ADOPT = 0.6
PATHS = [
    'site/src/app/affixes/affix-packages.service.ts',
    'site/src/app/affix-packages.service.ts',
    'site/src/app/affix-picker/affix-picker.component.ts',
    'site/src/app/affix-cloud/affix-cloud.component.ts',
]
DERIVED = re.compile(r' \(%\)$')

args = [a for a in sys.argv[1:] if not a.startswith('--')]
coverage_path = sys.argv[sys.argv.index('--coverage') + 1] if '--coverage' in sys.argv else None
if coverage_path:
    args.remove(coverage_path)
builds = json.load(open(args[0]))['builds']

synonyms = {s.lower(): e['name'] for e in json.load(open('data/affix-synonyms.json')) for s in e['synonyms']}


def canon(name):
    return synonyms.get(name.lower(), name)


def git(*cmd):
    return subprocess.run(['git', *cmd], capture_output=True, text=True, check=True).stdout


# Bundle versions, oldest first, from master's first-parent history (when each reached master).
versions = []
log = git('log', '--first-parent', '--reverse', '--format=%H %cI', 'origin/master', '--', *PATHS)
for line in log.splitlines():
    sha, date = line.split()
    for path in PATHS:
        try:
            src = git('show', f'{sha}:{path}')
        except subprocess.CalledProcessError:
            continue
        bundles = {}
        for kind, name, body in re.findall(r"(packages|spellpowerPackages)\.set\(\s*['\"]([^'\"]+)['\"]\s*,\s*\[(.*?)\]\s*\)", src, re.S):
            bundles[name] = [canon(a) for a in re.findall(r"['\"]([^'\"]+)['\"]", body)]
        if bundles and (not versions or versions[-1][1] != bundles):
            versions.append((date, bundles))
        break


def adopts(tracked, name, bundles):
    version = bundles[name]
    others = set(a for n, v in bundles.items() if n != name for a in v)
    distinctive = [a for a in version if a not in others]
    basis = distinctive if len(distinctive) >= 2 else version
    return sum(a in tracked for a in basis) >= ADOPT * len(basis)


def bundles_at(date):
    current = versions[0][1]
    for when, bundles in versions:
        if when <= date:
            current = bundles
    return current


def decode(blob):
    raw = blob[3:] + '=' * (-len(blob[3:]) % 4)
    return json.loads(zlib.decompress(base64.urlsafe_b64decode(raw)))


latest = versions[-1][1]
ever = {name: set() for _, bundles in versions for name in bundles}
for _, bundles in versions:
    for name, affixes in bundles.items():
        ever[name] |= set(affixes)
in_any_current_bundle = set(a for affixes in latest.values() for a in affixes)

rows = []
for b in builds:
    try:
        payload = decode(b['blob'])
    except Exception:
        continue
    tracked = {canon(a) for a in payload.get('t', []) if not DERIVED.search(a)}
    rows.append((b.get('createdAt') or '', tracked, b.get('owner')))

print(f'{len(rows)} builds; bundle versions found: ' + ', '.join(f"{d[:10]}" for d, _ in versions))
print()

coverage = {}
if coverage_path:
    report = json.load(open(coverage_path))
    for row in report['needCoverage']:
        affix, typ = row['need'].split('|')
        coverage.setdefault(affix, []).append((row['coveredShare'], typ, row['tracked']))

ORDER = ['Basic', 'Melee', 'Ranged', 'Caster', 'Trapping']
for name in ORDER + sorted(n for n in ever if n not in ORDER):
    adopters = []
    for created, tracked, owner in rows:
        bundles = bundles_at(created)
        if name in bundles and adopts(tracked, name, bundles):
            adopters.append((created, tracked, set(bundles[name])))
    if not adopters:
        continue
    print(f'## {name}: {len(adopters)} builds adopt it')
    print()
    print('| Affix | In bundle now | Kept, where the bundle had it | Added anyway, where it didn\'t |')
    print('|---|---|---|---|')
    for affix in sorted(ever[name], key=lambda a: (a not in latest.get(name, []), a)):
        had = [t for _, t, v in adopters if affix in v]
        lacked = [t for _, t, v in adopters if affix not in v]
        kept = f"{sum(affix in t for t in had) / len(had):.0%} of {len(had)}" if had else '-'
        added = f"{sum(affix in t for t in lacked) / len(lacked):.0%} of {len(lacked)}" if lacked else '-'
        print(f"| {affix} | {'yes' if affix in latest.get(name, []) else 'no'} | {kept} | {added} |")
    extra = collections.Counter()
    for created, tracked, version in adopters:
        bundles = bundles_at(created)
        own = set().union(*[set(v) for n, v in bundles.items() if adopts(tracked, n, bundles)])
        for affix in tracked - own - version:
            extra[affix] += 1
    common = [(a, n) for a, n in extra.most_common(15) if n >= max(5, 0.1 * len(adopters))]
    if common:
        print()
        print('Tracked by its adopters beyond the bundles they adopted: ' + ', '.join(
            f"{a} {n / len(adopters):.0%}{'' if a in in_any_current_bundle else ' (in no bundle)'}" for a, n in common))
    print()

print('## Most tracked affixes that are in no current bundle')
print()
counts = collections.Counter(a for _, t, _ in rows for a in t if a not in in_any_current_bundle)
print(', '.join(f'{a} {n}' for a, n in counts.most_common(40)))
print()

if coverage:
    print('## Effort: how often finished endgame builds that track an affix cover it')
    print()
    print('Main type = the bonus type covered most often. "Any type" = the best-covered of its types.')
    print()
    print('| Affix | In a bundle | Builds tracking | Best-covered type | Covered |')
    print('|---|---|---|---|---|')
    per_affix = []
    for affix, types in coverage.items():
        best = max(types)
        per_affix.append((best[0], affix, best[1], max(t[2] for t in types)))
    for share, affix, typ, tracked in sorted(per_affix):
        if tracked >= 20:
            print(f"| {affix} | {'yes' if affix in in_any_current_bundle else 'no'} | {tracked} | {typ} | {share:.0%} |")
