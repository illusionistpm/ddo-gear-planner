import json
from parse_slavers import parse_slavers_crafting

outFile = "../site/src/assets/crafting.json"

nearlyFinished = json.load(open('nearly-finished.json', "r", encoding='utf-8'))

slavers = parse_slavers_crafting()

combined = {}
combined.update(nearlyFinished)
combined.update(slavers)

out = json.dumps(combined, sort_keys=True, indent=4)
open(outFile, 'w', encoding='utf8').write(out)