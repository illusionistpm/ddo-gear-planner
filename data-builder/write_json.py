import json
import os
from provenance_io import get_asset_json_path, get_provenance_json_path, include_affix_provenance, strip_provenance

def write_json(dict, fileName):
    out = json.dumps(strip_provenance(dict), sort_keys=True, indent=4)
    path = get_asset_json_path(fileName)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf8') as fh:
        fh.write(out)
    print('Wrote ' + path)

    if include_affix_provenance():
        provenance_out = json.dumps(dict, sort_keys=True, indent=4)
        provenance_path = get_provenance_json_path(fileName)
        os.makedirs(os.path.dirname(provenance_path), exist_ok=True)
        with open(provenance_path, 'w', encoding='utf8') as fh:
            fh.write(provenance_out)
        print('Wrote ' + provenance_path)
