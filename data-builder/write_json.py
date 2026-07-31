import json
import os
from get_output_path import get_output_path

def write_json(dict, fileName):
    out = json.dumps(dict, sort_keys=True, indent=4)
    path = os.path.normpath(os.path.join(get_output_path(), fileName + '.json'))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf8') as fh:
        fh.write(out)
    print('Wrote ' + path)
