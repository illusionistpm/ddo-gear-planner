import json

def read_json(fileName):
    path = '../site/src/assets/' + fileName + '.json'
    file = open(path, 'r', encoding='utf8').read()
    out = json.loads(file)
    return out