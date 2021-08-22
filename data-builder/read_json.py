import json
from get_output_path import get_output_path

def read_json(fileName):
    path = f"{get_output_path()}/" + fileName + '.json'
    file = open(path, 'r', encoding='utf8').read()
    out = json.loads(file)
    return out