import json
from get_output_path import get_output_path

def write_json(dict, fileName):
    out = json.dumps(dict, sort_keys=True, indent=4)
    path = f"{get_output_path()}/" + fileName + '.json'
    open(path, 'w', encoding='utf8').write(out)
    print('Wrote ' + path)
