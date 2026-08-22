import parse_items
from parse_items import get_items_from_page


def write_item_page(tmp_path, row_html):
    page_path = tmp_path / 'items.html'
    page_path.write_text(f'''
    <html>
      <h1 id="firstHeading">Category:Trinket items</h1>
      <table class="wikitable">
        <tr><th>Item</th><th>Special Abilities</th><th>ML</th><th>Bind</th><th>Quest</th><th>Chest</th></tr>
        {row_html}
      </table>
    </html>
    ''', encoding='utf-8')
    return str(page_path)


def metadata_items(tmp_path, row_html, rare_names=None, quest_packs=None, monkeypatch=None):
    if monkeypatch is not None:
        monkeypatch.setattr(parse_items, 'get_inverted_synonym_map', lambda: {})
        monkeypatch.setattr(parse_items, 'get_fake_bonuses', lambda: {})
        monkeypatch.setattr(parse_items, 'parse_affixes_from_cell', lambda *args, **kwargs: [])
    return get_items_from_page(
        write_item_page(tmp_path, row_html),
        {},
        {},
        rare_names or set(),
        quest_packs or {},
    )


def test_item_metadata_marks_rare_from_rare_loot_list(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Heartshard" title="Item:Heartshard">Heartshard</a></td>
        <td></td><td>8</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/Snowfall_and_Sunlight" title="Snowfall and Sunlight">Snowfall and Sunlight</a></td>
        <td>end chest</td>
      </tr>
    ''', {'Heartshard'}, {'Snowfall and Sunlight': 'The Chill of Ravenloft'}, monkeypatch)

    assert items[0]['rare'] is True
    assert items[0]['pack'] == 'The Chill of Ravenloft'


def test_item_metadata_marks_rare_from_explicit_rare_drop_text(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Bastard_Sword_of_the_Golden_Age" title="Item:Bastard Sword of the Golden Age">Bastard Sword of the Golden Age</a></td>
        <td></td><td>13</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/Magic_of_Myth_Drannor" title="Magic of Myth Drannor">Magic of Myth Drannor</a></td>
        <td>rare drop in any end chest or most optional chests</td>
      </tr>
    ''', set(), {'Some Quest': 'Magic of Myth Drannor'}, monkeypatch)

    assert items[0]['rare'] is True
    assert items[0]['pack'] == 'Magic of Myth Drannor'


def test_item_metadata_marks_catalyst_crafting_locations_as_rare(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Boundless" title="Item:Boundless">Boundless</a></td>
        <td></td><td>33</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/Catalyst_Crafting" title="Catalyst Crafting">Catalyst Crafting</a></td>
        <td>crafted</td>
      </tr>
    ''', set(), {}, monkeypatch)

    assert items[0]['rare'] is True
    assert items[0]['quests'] == ['Catalyst Crafting']


def test_item_metadata_merges_craftable_affix_into_canonical_item(tmp_path, monkeypatch):
    monkeypatch.setattr(parse_items, 'get_inverted_synonym_map', lambda: {})
    monkeypatch.setattr(parse_items, 'get_fake_bonuses', lambda: {})
    monkeypatch.setattr(
        parse_items,
        'parse_affixes_from_cell',
        lambda *args, **kwargs: [{'name': 'Craftable (hidden)', 'type': 'Bool', 'value': 1}],
    )

    items = get_items_from_page(
        write_item_page(tmp_path, '''
          <tr>
            <td><a href="/page/Item:Gem_of_Many_Facets" title="Item:Gem of Many Facets">Gem of Many Facets</a></td>
            <td>Craftable</td><td>5</td><td>Bound to Account on Acquire</td>
            <td><a href="/page/The_Chronoscope" title="The Chronoscope">The Chronoscope</a></td>
            <td>end chest</td>
          </tr>
        '''),
        {},
        {},
    )

    assert [item['name'] for item in items] == ['Gem of Many Facets']
    assert items[0]['affixes'] == []
    assert items[0]['crafting'] == [
        'Essence Crafting: Trinket - Extra',
        'Essence Crafting: Trinket - Prefix',
        'Essence Crafting: Trinket - Suffix',
    ]


def test_item_metadata_labels_sharn_rare_drop_artifacts_as_sharn_quests(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Sigil_of_Regalport" title="Item:Sigil of Regalport">Sigil of Regalport</a></td>
        <td></td><td>29</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/Too_Hot_to_Handle" title="Too Hot to Handle">Too Hot to Handle</a></td>
        <td>end chest; Masterminds of Sharn Elite/True Elite end reward; rare drop in any legendary Sharn quest</td>
      </tr>
    ''', set(), {'Too Hot to Handle': 'Masterminds of Sharn'}, monkeypatch)

    assert items[0]['rare'] is True
    assert items[0]['pack'] == 'Masterminds of Sharn'
    assert items[0]['quests'] == ['Sharn quests']


def test_item_metadata_does_not_mark_rare_encounter_text_as_rare(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Gravekeeper%27s_Armor" title="Item:Gravekeeper's Armor">Gravekeeper's Armor</a></td>
        <td></td><td>8</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/Land_of_Lamordia" title="Land of Lamordia">Land of Lamordia</a></td>
        <td>red-named rare encounter chests</td>
      </tr>
    ''', set(), {}, monkeypatch)

    assert 'rare' not in items[0]


def test_item_metadata_marks_rare_drop_from_rare_encounter_text_as_rare(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Rare_Encounter_Prize" title="Item:Rare Encounter Prize">Rare Encounter Prize</a></td>
        <td></td><td>8</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/Land_of_Lamordia" title="Land of Lamordia">Land of Lamordia</a></td>
        <td>rare drop from a rare encounter chest</td>
      </tr>
    ''', set(), {}, monkeypatch)

    assert items[0]['rare'] is True


def test_item_metadata_infers_lamordia_pack_from_row_source_text(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Lamordian_Armor" title="Item:Lamordian Armor">Lamordian Armor</a></td>
        <td>Lamordia: Melancholic Slot (Armor)</td><td>8</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/Ends_and_Means" title="Ends and Means">Ends and Means</a></td>
        <td>optional chest</td>
      </tr>
    ''', set(), {}, monkeypatch)

    assert items[0]['pack'] == 'Lamordia'
