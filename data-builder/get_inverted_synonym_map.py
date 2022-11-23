from read_json import read_json

def get_inverted_synonym_map():
    synData = read_json('affix-synonyms')

    out = {}
    for syn in synData:
        for name in syn['synonyms']:
            out[name] = syn['name']
    return out
