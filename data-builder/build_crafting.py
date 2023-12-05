import json
from parse_slavers import parse_slavers_crafting
from parse_augments import parse_augments
from write_json import write_json
from parse_dinosaur_bone_crafting import parse_dinosaur_bone_crafting
from get_lost_purpose import get_lost_purpose_crafting
import os

def build_crafting():
    nearlyFinished = json.load(open(f"{os.path.dirname(__file__)}/nearly-finished.json", "r", encoding='utf-8'))

    slavers = parse_slavers_crafting()

    dino_bone = parse_dinosaur_bone_crafting()

    lost_purpose = get_lost_purpose_crafting()

    augments = parse_augments()

    combined = {}
    combined.update(nearlyFinished)
    combined.update(slavers)
    combined.update(dino_bone)
    combined.update(augments)
    combined.update(lost_purpose)

    write_json(combined, 'crafting')


if __name__ == "__main__":
    build_crafting()