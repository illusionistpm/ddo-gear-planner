import json

def write_json(dict, fileName):
    out = json.dumps(dict, sort_keys=True, indent=4)
    path = '../site/src/assets/' + fileName + '.json'
    open(path, 'w', encoding='utf8').write(out)
    print('Wrote ' + path)
