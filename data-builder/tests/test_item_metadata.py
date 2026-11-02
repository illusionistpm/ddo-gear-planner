import parse_items
from item_sources import SourceResolver
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
    metadata_items.resolver = SourceResolver(quest_packs or {})
    return get_items_from_page(
        write_item_page(tmp_path, row_html),
        {},
        {},
        rare_names or set(),
        metadata_items.resolver,
    )


def first_source_pack(item):
    # Items carry only their sources; the pack comes from the source map.
    assert 'pack' not in item
    return metadata_items.resolver.resolve(item['quests'][0])[1]


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
    assert first_source_pack(items[0]) == 'The Chill of Ravenloft'


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
    assert first_source_pack(items[0]) == 'Magic of Myth Drannor'


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
    assert first_source_pack(items[0]) == 'Masterminds of Sharn'
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


def test_item_metadata_names_the_row_hint_as_the_source_of_an_unlinked_row(tmp_path, monkeypatch):
    # The Cataclysmic shields: an empty location cell, and only an augment
    # slot's name to say where they're from.
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Lamordian_Armor" title="Item:Lamordian Armor">Lamordian Armor</a></td>
        <td>Lamordia: Melancholic Slot (Armor)</td><td>8</td><td>Bound to Account on Acquire</td>
        <td></td>
        <td>optional chest</td>
      </tr>
    ''', set(), {}, monkeypatch)

    assert items[0]['quests'] == ['Lamordia']
    assert first_source_pack(items[0]) == 'The Chill of Ravenloft'


def test_item_metadata_prefers_a_linked_source_to_the_row_hint(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Lamordian_Armor" title="Item:Lamordian Armor">Lamordian Armor</a></td>
        <td>Lamordia: Melancholic Slot (Armor)</td><td>8</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/Ends_and_Means" title="Ends and Means">Ends and Means</a></td>
        <td>optional chest</td>
      </tr>
    ''', set(), {'Ends and Means': 'The Chill of Ravenloft'}, monkeypatch)

    assert items[0]['quests'] == ['Ends and Means']
    assert first_source_pack(items[0]) == 'The Chill of Ravenloft'


def test_item_metadata_keeps_every_source_and_the_first_ones_pack(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Two_Drop" title="Item:Two Drop">Two Drop</a></td>
        <td></td><td>8</td><td>Bound to Account on Acquire</td>
        <td><ul>
          <li><a href="/page/Quest_A" title="Quest A">Quest A</a>, end chest</li>
          <li><a href="/page/Quest_B" title="Quest B">Quest B</a>, end chest</li>
        </ul></td>
        <td></td>
      </tr>
    ''', set(), {'Quest A': 'Pack A', 'Quest B': 'Pack B'}, monkeypatch)

    assert items[0]['quests'] == ['Quest A', 'Quest B']
    assert first_source_pack(items[0]) == 'Pack A'


def test_item_metadata_marks_rare_only_when_every_source_is_a_rare_location(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Mixed" title="Item:Mixed">Mixed</a></td>
        <td></td><td>8</td><td>Bound to Account on Acquire</td>
        <td><ul>
          <li><a href="/page/Catalyst_Crafting" title="Catalyst Crafting">Catalyst Crafting</a></li>
          <li><a href="/page/Quest_A" title="Quest A">Quest A</a>, end chest</li>
        </ul></td>
        <td></td>
      </tr>
    ''', set(), {'Quest A': 'Pack A'}, monkeypatch)

    assert items[0]['quests'] == ['Catalyst Crafting', 'Quest A']
    assert 'rare' not in items[0]


def test_item_with_non_numeric_ml_is_skipped_not_fatal(tmp_path, monkeypatch):
    # A new wiki page can list its minimum level as a placeholder ('???') before
    # it is filled in. That row must be skipped, not crash the whole build.
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Placeholder_Lantern" title="Item:Placeholder Lantern">Placeholder Lantern</a></td>
        <td></td><td>???</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/The_Court_of_Strahd" title="The Court of Strahd">The Court of Strahd</a></td>
        <td>end chest</td>
      </tr>
      <tr>
        <td><a href="/page/Item:Heartshard" title="Item:Heartshard">Heartshard</a></td>
        <td></td><td>8</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/Snowfall_and_Sunlight" title="Snowfall and Sunlight">Snowfall and Sunlight</a></td>
        <td>end chest</td>
      </tr>
    ''', monkeypatch=monkeypatch)

    assert [item['name'] for item in items] == ['Heartshard']
    assert items[0]['ml'] == 8


def test_item_with_ml_none_still_defaults_to_one(tmp_path, monkeypatch):
    items = metadata_items(tmp_path, '''
      <tr>
        <td><a href="/page/Item:Heartshard" title="Item:Heartshard">Heartshard</a></td>
        <td></td><td>None</td><td>Bound to Account on Acquire</td>
        <td><a href="/page/Snowfall_and_Sunlight" title="Snowfall and Sunlight">Snowfall and Sunlight</a></td>
        <td>end chest</td>
      </tr>
    ''', monkeypatch=monkeypatch)

    assert items[0]['ml'] == 1
