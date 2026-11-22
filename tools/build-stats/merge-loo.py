"""Merge the leave-one-out results of several real-builds.spec.ts shards (SUGGESTION_EVAL_SHARD=k/n).

Every shard writes the same statistics; only leaveOneOut differs. This weights each shard's averages
by its count and prints the combined table, overall and per slot.

Usage: python3 tools/build-stats/merge-loo.py shard-0.json shard-1.json ... [--json merged.json]
"""
import json
import sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
out = sys.argv[sys.argv.index('--json') + 1] if '--json' in sys.argv else None
if out:
    args.remove(out)
reports = [json.load(open(p)) for p in args]
METRICS = ['meanRank', 'mrr', 'hit1', 'hit5', 'hit20']


def merge(parts):
    n = sum(p['n'] for p in parts)
    merged = {'n': n, 'missing': sum(p['missing'] for p in parts)}
    scorers = [k for k in parts[0] if isinstance(parts[0][k], dict)]
    for scorer in scorers:
        merged[scorer] = {m: round(sum((p[scorer] or {}).get(m, 0) * p['n'] for p in parts if p['n']) / n, 3) if n else None
                          for m in METRICS}
    return merged


result = {
    'builds': sum(r['leaveOneOut']['builds'] for r in reports),
    'all': merge([r['leaveOneOut']['all'] for r in reports]),
    'bySlot': {slot: merge([r['leaveOneOut']['bySlot'][slot] for r in reports if slot in r['leaveOneOut']['bySlot']])
               for slot in sorted({s for r in reports for s in r['leaveOneOut']['bySlot']})},
}

scorers = [k for k in result['all'] if isinstance(result['all'][k], dict)]
print(f"{result['builds']} builds, {result['all']['n']} slots ranked ({result['all']['missing']} items not in the candidate list)")
print()
print('| Slot | n | ' + ' | '.join(scorers) + ' |')
print('|---|---|' + '---|' * len(scorers))
for name, row in [('all', result['all'])] + list(result['bySlot'].items()):
    cells = [f"MRR {row[s]['mrr']:.2f}, hit@20 {row[s]['hit20']:.0%}, rank {row[s]['meanRank']:.0f}" if row.get(s) and row[s]['mrr'] is not None else '' for s in scorers]
    print(f"| {name} | {row['n']} | " + ' | '.join(cells) + ' |')
if out:
    json.dump(result, open(out, 'w'), indent=1)
