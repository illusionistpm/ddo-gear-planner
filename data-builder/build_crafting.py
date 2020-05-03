import json
from parse_slavers import parse_slavers_crafting
from parse_augments import parse_augments
from write_json import write_json

def build_crafting():
    nearlyFinished = json.load(open('nearly-finished.json', "r", encoding='utf-8'))

    slavers = parse_slavers_crafting()

    augments = parse_augments()

    combined = {}
    combined.update(nearlyFinished)
    combined.update(slavers)
    combined.update(augments)

    write_json(combined, 'crafting')


if __name__ == "__main__":
    build_crafting()