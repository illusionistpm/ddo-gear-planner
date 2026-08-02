import json
import os

from provenance_io import get_asset_json_path, get_provenance_json_path, include_affix_provenance

def read_json(fileName):
    provenance_path = get_provenance_json_path(fileName)
    path = provenance_path if include_affix_provenance() and os.path.exists(provenance_path) else get_asset_json_path(fileName)
    file = open(path, 'r', encoding='utf8').read()
    out = json.loads(file)
    return out
