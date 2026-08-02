from bs4 import BeautifulSoup
import json
import os

from parse_affixes_from_cell import get_item_property_map_from_tag, replace_item_set_affixes
from get_output_path import get_output_path


def test_get_item_property_map_set_and_crafting_detection():
    setMap = {'Some Set': True}
    craftingMap = {'Essence Crafting': {'*': []}, 'OtherCraft': {'*': []}}
    html = '<ul><li>Some Set</li><li>Essence Crafting</li><li>Something Else</li></ul>'
    ul = BeautifulSoup(html, 'html.parser').ul
    res = get_item_property_map_from_tag(ul, setMap, craftingMap)
    assert 'set' in res and res['set'] == ['Some Set']
    assert 'crafting' in res and 'Essence Crafting' in res['crafting']


def test_replace_item_set_affixes_writes_set_field_and_removes_affix():
    # create a temporary sets file that replace_item_set_affixes will read
    out_dir = get_output_path()
    sets_path = os.path.join(out_dir, 'sets.json')
    original_sets = None
    if os.path.exists(sets_path):
        with open(sets_path, 'r', encoding='utf8') as f:
            original_sets = f.read()

    try:
        with open(sets_path, 'w', encoding='utf8') as f:
            json.dump({'Some Set': {}}, f)

        # build a small itemMap structure matching expected shape
        itemMap = {
            'slot': {
                '*': [
                    {
                        'affixes': [
                            {'name': 'Some Set'}
                        ]
                    }
                ]
            }
        }

        out = replace_item_set_affixes(itemMap)
        assert 'set' in out['slot']['*'][0]
        assert out['slot']['*'][0]['set'] == 'Some Set'
        assert 'affixes' not in out['slot']['*'][0]

    finally:
        if original_sets is not None:
            with open(sets_path, 'w', encoding='utf8') as f:
                f.write(original_sets)
        elif os.path.exists(sets_path):
            os.remove(sets_path)
