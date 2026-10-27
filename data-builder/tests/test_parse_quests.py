from bs4 import BeautifulSoup

from parse_quests import FREE_TO_PLAY, canonicalise_pack_layer, drop_free_to_play, merge_pack_layer, add_crafting_raid_sources, get_adventure_pack_name_map_from_page, get_area_pack_map_from_wilderness_page, get_expansion_pack_pages_from_category, get_official_packs, get_quest_pack_map_from_level_page, get_quest_pack_map_from_pack_page, get_quest_pack_map_from_sectioned_page


def test_add_crafting_raid_sources_marks_ritual_table_as_raid_source():
    assert add_crafting_raid_sources(['Tempest Spine']) == ['Tempest Spine', 'Ritual Table']
    assert add_crafting_raid_sources(['Ritual Table']) == ['Ritual Table']


def test_get_quest_pack_map_from_sectioned_page_uses_pack_heading():
    html = '''
    <div id="mw-content-text">
      <h3>The Dreaming Dark <span class="mw-editsection">[ edit ]</span></h3>
      <table class="wikitable">
        <tbody>
          <tr><th>Quest Name</th><th>Quest Level</th></tr>
          <tr><td><a href="/page/Finding_the_Path" title="Finding the Path">Finding the Path</a></td><td>19</td></tr>
        </tbody>
      </table>
    </div>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_quest_pack_map_from_sectioned_page(soup) == {
        'Finding the Path': 'The Dreaming Dark',
    }


def test_get_adventure_pack_name_map_from_page_reads_canonical_pack_names():
    html = '''
    <table class="wikitable sortable">
      <tr><th>Name of the pack</th><th>Levels</th></tr>
      <tr>
        <td><a href="/page/Litany_of_the_Dead_Part_4" title="Litany of the Dead Part 4">The Necropolis Part 4</a></td>
        <td>14 to 17</td>
      </tr>
    </table>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_adventure_pack_name_map_from_page(soup) == {
        'The Necropolis Part 4': 'The Necropolis Part 4',
        'Litany of the Dead Part 4': 'The Necropolis Part 4',
    }


def test_get_adventure_pack_name_map_from_page_reads_pass_header_variant():
    # The wiki silently reworded this column from "Name of the pack" to
    # "Name of the pass" (same table/column, just different text), which
    # broke every pack-name lookup relying on it until this variant was
    # added - see the real-world fallout in test_build_url_codec_dictionary.
    html = '''
    <table class="wikitable sortable">
      <tr><th>Name of the pass</th><th>Levels</th></tr>
      <tr>
        <td><a href="/page/Litany_of_the_Dead_Part_1" title="Litany of the Dead Part 1">The Necropolis Part 1</a></td>
        <td>5 to 6</td>
      </tr>
    </table>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_adventure_pack_name_map_from_page(soup) == {
        'The Necropolis Part 1': 'The Necropolis Part 1',
        'Litany of the Dead Part 1': 'The Necropolis Part 1',
    }


def test_get_adventure_pack_name_map_from_page_ignores_tooltip_links():
    html = '''
    <table class="wikitable sortable">
      <tr><th>Name of the pack</th><th>Levels</th></tr>
      <tr>
        <td>
          <a href="/page/Shadowfell_Conspiracy" title="Shadowfell Conspiracy">Shadowfell Conspiracy</a>
          <span class="popup">Expansion<span class="tooltip">Includes <a href="/page/Disciples_of_Shadow" title="Disciples of Shadow">Disciples of Shadow</a></span></span>
        </td>
        <td>15 to 19</td>
      </tr>
    </table>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_adventure_pack_name_map_from_page(soup) == {
        'Shadowfell Conspiracy': 'Shadowfell Conspiracy',
    }


def test_get_quest_pack_map_from_sectioned_page_uses_canonical_adventure_pack_name():
    html = '''
    <div id="mw-content-text">
      <h4>Part 4 - <a href="/page/Litany_of_the_Dead_Part_4" title="Litany of the Dead Part 4">Litany of the Dead Part 4</a> <span class="mw-editsection">[ edit ]</span></h4>
      <table class="wikitable">
        <tbody>
          <tr><th>Quest Name</th><th>Quest Level</th></tr>
          <tr><td><a href="/page/Litany_of_the_Dead" title="Litany of the Dead">Litany of the Dead</a></td><td>15</td></tr>
        </tbody>
      </table>
    </div>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_quest_pack_map_from_sectioned_page(soup, {
        'Litany of the Dead Part 4': 'The Necropolis Part 4',
    }) == {
        'Litany of the Dead': 'The Necropolis Part 4',
    }


def test_get_quest_pack_map_from_sectioned_page_removes_location_suffix_from_pack_name():
    html = '''
    <div id="mw-content-text">
      <h3>Demon Sands - <a href="/page/Zawabi%27s_Refuge" title="Zawabi's Refuge">Zawabi's Refuge</a> <span class="mw-editsection">[ edit ]</span></h3>
      <table class="wikitable">
        <tbody>
          <tr><th>Quest Name</th><th>Quest Level</th></tr>
          <tr><td><a href="/page/Raid_the_Vulkoorim" title="Raid the Vulkoorim">Raid the Vulkoorim</a></td><td>11</td></tr>
        </tbody>
      </table>
    </div>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_quest_pack_map_from_sectioned_page(soup, {
        'Demon Sands': 'Demon Sands',
    }) == {
        'Raid the Vulkoorim': 'Demon Sands',
    }


def test_get_quest_pack_map_from_pack_page_uses_supplied_pack_name():
    html = '''
    <table class="wikitable">
      <tbody>
        <tr><th>Quest Name</th><th>Quest Level</th></tr>
        <tr><td><a href="/page/A_Sharn_Welcome" title="A Sharn Welcome">A Sharn Welcome</a></td><td>15</td></tr>
      </tbody>
    </table>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_quest_pack_map_from_pack_page(soup, 'Masterminds of Sharn') == {
        'A Sharn Welcome': 'Masterminds of Sharn',
    }


def test_get_quest_pack_map_from_pack_page_skips_summary_and_xp_rows():
    html = '''
    <table class="wikitable">
      <tbody>
        <tr><th>Quest Name</th><th>Quest Level</th><th>Base Favor</th><th>Patron</th></tr>
        <tr><td><a href="/page/Shadow_of_a_Doubt" title="Shadow of a Doubt">Shadow of a Doubt</a></td><td>15</td><td>6</td><td>Purple Dragon Knights</td></tr>
        <tr><td>2,360</td></tr>
        <tr><td><b>Total</b></td><td></td><td>18</td><td></td></tr>
      </tbody>
    </table>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_quest_pack_map_from_pack_page(soup, 'Shadowfell Conspiracy') == {
        'Shadow of a Doubt': 'Shadowfell Conspiracy',
    }


def test_get_quest_pack_map_from_pack_page_includes_public_zone_locations():
    html = '''
    <div id="mw-content-text">
      <h3>Public zone <span class="mw-editsection">[ edit ]</span></h3>
      <ul>
        <li><a href="/page/Blue_Water_Inn" title="Blue Water Inn">Blue Water Inn</a></li>
      </ul>
      <h2>Quests</h2>
    </div>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_quest_pack_map_from_pack_page(soup, 'Mists of Ravenloft') == {
        'Blue Water Inn': 'Mists of Ravenloft',
    }


def test_get_quest_pack_map_from_pack_page_matches_location_headings_in_any_case():
    # Terror of Demogorgon's page capitalises both headings; matching them
    # exactly left The Darklake's items with no pack.
    html = '''
    <div id="mw-content-text">
      <h3>Public Zone <span class="mw-editsection">[ edit ]</span></h3>
      <ul>
        <li><a href="/page/Gravenhollow" title="Gravenhollow">Gravenhollow</a></li>
      </ul>
      <h3>Wilderness Adventure Area <span class="mw-editsection">[ edit ]</span></h3>
      <ul>
        <li><a href="/page/The_Darklake" title="The Darklake">The Darklake</a></li>
      </ul>
      <h2>Quests</h2>
    </div>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_quest_pack_map_from_pack_page(soup, 'Terror of Demogorgon') == {
        'Gravenhollow': 'Terror of Demogorgon',
        'The Darklake': 'Terror of Demogorgon',
    }


def test_get_expansion_pack_pages_from_category_reads_pack_links():
    html = '''
    <div id="mw-pages">
      <a href="/page/Mists_of_Ravenloft" title="Mists of Ravenloft">Mists of Ravenloft</a>
      <a href="/page/Masterminds_of_Sharn" title="Masterminds of Sharn">Masterminds of Sharn</a>
    </div>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_expansion_pack_pages_from_category(soup) == {
        'Mists_of_Ravenloft': 'Mists of Ravenloft',
        'Masterminds_of_Sharn': 'Masterminds of Sharn',
    }


def test_get_official_packs_combines_adventure_pack_table_and_expansion_titles():
    pack_name_map = {'Vault of Night': 'The Vault of Night', 'The Vault of Night': 'The Vault of Night', 'Tangleroot Gorge': 'Tangleroot Gorge'}

    assert get_official_packs(pack_name_map, ['Vecna Unleashed', 'Tangleroot Gorge']) == [
        'Tangleroot Gorge', 'The Vault of Night', 'Vecna Unleashed',
    ]


# Trimmed from the wiki's Quests_by_level_and_XP page.
LEVEL_PAGE = '''
<div id="mw-content-text">
  <h2>Heroic</h2>
  <table class="wikitable sortable"><tbody>
    <tr><th>Quest Name</th><th>Quest Level</th><th>Casual/Solo</th><th>Duration</th><th>Adventure Pack</th><th>Patron</th></tr>
    <tr><td><a href="/page/Vecna_Unleashed_(quest)" title="Vecna Unleashed (quest)">Vecna Unleashed</a></td><td>20</td><td>1</td><td>Long</td><td><a href="/page/Vecna_Unleashed" title="Vecna Unleashed">Vecna Unleashed</a></td><td>The Twelve</td></tr>
    <tr><td><a href="/page/Korthos_Village" title="Korthos Village">Korthos Village</a></td><td>1</td><td>1</td><td>Short</td><td><a href="/page/Free_to_Play" title="Free to Play">Free to Play</a></td><td></td></tr>
  </tbody></table>
  <h2>Epic</h2>
  <table class="wikitable sortable"><tbody>
    <tr><th>Quest Name</th><th>Quest Level</th><th>Casual/Solo</th><th>Duration</th><th>Adventure Pack</th><th>Patron</th></tr>
    <tr><td><a href="/page/Return_to_Gianthold_Tor" title="Return to Gianthold Tor">Return to Gianthold Tor</a></td><td>25</td><td>1</td><td>Long</td><td>Ruins of Gianthold</td><td></td></tr>
    <tr><td><a href="/page/ToEE:_Fire_Node" title="ToEE: Fire Node">Temple of Elemental Evil: Fire Node</a></td><td>27</td><td>1</td><td>Long</td><td>The Temple of Elemental Evil</td><td></td></tr>
  </tbody></table>
</div>
'''


def test_get_quest_pack_map_from_level_page_keys_quests_by_page_title_and_text():
    quest_packs = get_quest_pack_map_from_level_page(BeautifulSoup(LEVEL_PAGE, 'html.parser'))

    assert quest_packs == {
        'Vecna Unleashed (quest)': 'Vecna Unleashed',
        'Vecna Unleashed': 'Vecna Unleashed',
        'Return to Gianthold Tor': 'Ruins of Gianthold',
        'ToEE: Fire Node': 'The Temple of Elemental Evil',
        'Temple of Elemental Evil: Fire Node': 'The Temple of Elemental Evil',
        'Korthos Village': FREE_TO_PLAY,
    }


def test_free_to_play_from_the_level_page_overrides_an_older_source():
    # The old Quests_by_Adventure_Pack page still gives some quests the wiki
    # now calls Free to Play a pack.
    quest_packs = merge_pack_layer(
        canonicalise_pack_layer(get_quest_pack_map_from_level_page(BeautifulSoup(LEVEL_PAGE, 'html.parser')), {}),
        {'Korthos Village': 'Stale Pack', 'Old Only Quest': 'Old Pack'},
        'Quests_by_Adventure_Pack',
    )

    drop_free_to_play(quest_packs)

    assert 'Korthos Village' not in quest_packs
    assert quest_packs['Old Only Quest'] == 'Old Pack'


# Trimmed from the wiki's Wilderness_adventure_area page: a grouping header
# row comes first, and the Access column's links aren't pack names.
WILDERNESS_PAGE = '''
<div id="mw-content-text">
  <table class="wikitable"><tbody>
    <tr><th></th><th colspan="2">Explorer XP</th><th></th></tr>
    <tr><th>Area</th><th>Released</th><th>Level Range</th><th>Access</th></tr>
    <tr><td><a href="/page/Korthos_Island" title="Korthos Island">Korthos Island</a> (<a href="/page/Korthos_Island_map">map</a>)</td><td>Module 8</td><td>1</td><td><a href="/page/Free_to_Play" title="Free to Play">Free to Play</a></td></tr>
    <tr><td><a href="/page/The_Darklake" title="The Darklake">The Darklake</a></td><td>Update 70</td><td>31</td><td><a href="/page/Terror_of_Demogorgon" title="Terror of Demogorgon">Terror of Demogorgon</a></td></tr>
    <tr><td><a href="/page/Sands_of_Menechtarun" title="Sands of Menechtarun">Sands of Menechtarun</a></td><td>Module 6</td><td>12</td><td><a href="/page/Zawabi%27s_Refuge" title="Zawabi's Refuge">Demon Sands</a> 950</td></tr>
    <tr><td><a href="/page/Ruins_of_Gianthold_(heroic)" title="Ruins of Gianthold (heroic)">Ruins of Gianthold (heroic)</a></td><td>Module 7</td><td>15</td><td><a href="/page/Gianthold" title="Gianthold">The Ruins of Gianthold</a> 1,950</td></tr>
  </tbody></table>
</div>
'''


def test_get_area_pack_map_from_wilderness_page_reads_pack_from_access_text():
    area_packs = get_area_pack_map_from_wilderness_page(BeautifulSoup(WILDERNESS_PAGE, 'html.parser'))

    assert area_packs['The Darklake'] == 'Terror of Demogorgon'
    assert area_packs['Sands of Menechtarun'] == 'Demon Sands'
    assert area_packs['Ruins of Gianthold (heroic)'] == 'The Ruins of Gianthold'
    assert area_packs['Korthos Island'] == FREE_TO_PLAY


def test_merge_pack_layer_keeps_the_earlier_source_and_reports_conflicts(capsys):
    quest_packs = {'Quest': 'Better Source Pack'}

    merge_pack_layer(quest_packs, {'Quest': 'Stale Pack', 'New Quest': 'Pack'}, 'Old_Page')

    assert quest_packs == {'Quest': 'Better Source Pack', 'New Quest': 'Pack'}
    assert "Pack conflict for 'Quest'" in capsys.readouterr().out


def test_get_quest_pack_map_from_pack_page_reads_wilderness_and_city_zone_sections():
    # Keep on the Borderlands' page uses these shorter headings.
    html = '''
    <div id="mw-content-text">
      <h2>Wilderness</h2>
      <p><a href="/page/The_Borderlands" title="The Borderlands">The Borderlands</a></p>
      <h2>Quests</h2>
      <h2>City zone</h2>
      <p><a href="/page/The_Keep_on_the_Borderlands" title="The Keep on the Borderlands">The Keep</a></p>
      <h2>Loot</h2>
    </div>
    '''

    assert get_quest_pack_map_from_pack_page(BeautifulSoup(html, 'html.parser'), 'Keep on the Borderlands') == {
        'The Borderlands': 'Keep on the Borderlands',
        'The Keep on the Borderlands': 'Keep on the Borderlands',
    }


def test_canonicalise_pack_layer_keeps_the_names_items_already_carry():
    layer = {
        'Tomb of the Shadow King': 'The Necropolis, Part 2',
        'Haywire Foundry': 'Vault of Night',
        'The Borderlands': 'The Borderlands',
        'Grip Quest': 'Grip of the Hidden Hand',
    }

    assert canonicalise_pack_layer(layer, {}) == {
        'Tomb of the Shadow King': 'The Necropolis Part 2',
        'Haywire Foundry': 'The Vault of Night',
        'The Borderlands': 'Keep on the Borderlands',
        'Grip Quest': 'Grip of the Hidden Hand',
    }


def test_canonicalise_pack_layer_applies_overrides_after_the_adventure_pack_table():
    # The table can resolve a name to its own spelling; the override still wins.
    assert canonicalise_pack_layer({'Quest': 'Reavers Reach'}, {'Reavers Reach': "The Reaver's Reach"}) == {
        'Quest': "Reaver's Reach",
    }


def test_get_official_packs_uses_the_canonical_spelling():
    assert get_official_packs({'Haunted Halls of Eveningstar': 'Haunted Halls of Eveningstar'}, []) == [
        'The Haunted Halls of Eveningstar',
    ]
