import json
import os
import tempfile
from provenance_io import get_asset_json_path, get_provenance_json_path, include_affix_provenance, strip_provenance


def _write_json_file(path: str, contents: str) -> None:
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile('w', encoding='utf8', dir=directory, delete=False) as fh:
            temp_path = fh.name
            fh.write(contents)
        os.replace(temp_path, path)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.unlink(temp_path)


def write_json(dict, fileName):
    out = json.dumps(strip_provenance(dict), sort_keys=True, indent=4)
    path = get_asset_json_path(fileName)
    _write_json_file(path, out)
    print('Wrote ' + path)

    if include_affix_provenance():
        provenance_out = json.dumps(dict, sort_keys=True, indent=4)
        provenance_path = get_provenance_json_path(fileName)
        _write_json_file(provenance_path, provenance_out)
        print('Wrote ' + provenance_path)
