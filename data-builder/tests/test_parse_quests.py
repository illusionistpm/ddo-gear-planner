from bs4 import BeautifulSoup

from parse_quests import FREE_TO_PLAY, canonicalise_pack_layer, drop_free_to_play, get_free_quests_from_category_page, get_free_sources, merge_pack_layer, add_crafting_raid_sources, get_adventure_pack_name_map_from_page, get_area_pack_map_from_wilderness_page, get_expansion_pack_pages_from_category, get_coupons_from_page, get_official_packs, get_pack_info, get_pack_releases_from_page, get_quest_pack_map_from_level_page, get_quest_pack_map_from_pack_page, get_quest_pack_map_from_sectioned_page


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

    assert drop_free_to_play(quest_packs) == ['Korthos Village']

    assert 'Korthos Village' not in quest_packs
    assert quest_packs['Old Only Quest'] == 'Old Pack'


def test_illithid_invasion_quests_are_free_to_play():
    assert canonicalise_pack_layer({'Astral Ambush': 'Illithid Invasion'}, {}) == {'Astral Ambush': FREE_TO_PLAY}


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


# Trimmed from Category:Free_to_Play_quests: a quest table, and the category's
# page list, which also names quests the table leaves out.
FREE_CATEGORY_PAGE = '''
<div id="mw-content-text">
  <table class="mw-collapsible sortable sticky-header wikitable"><tbody>
    <tr><th>Quest Name</th><th>Level</th><th>Patron</th></tr>
    <tr><td><a href="/page/Made_to_Order" title="Made to Order">Made to Order</a></td><td>11</td><td><a href="/page/House_Kundarak" title="House Kundarak">House Kundarak</a></td></tr>
    <tr><td><a href="/page/Redemption_(quest)" title="Redemption (quest)">Redemption</a></td><td>12</td><td></td></tr>
  </tbody></table>
  <div id="mw-pages"><h2>Pages in category "Free to Play quests"</h2>
    <ul><li><a href="/page/Acid_Wit" title="Acid Wit">Acid Wit</a></li>
    <li><a href="/page/Made_to_Order" title="Made to Order">Made to Order</a></li></ul>
  </div>
</div>
'''


def test_get_free_quests_from_category_page_reads_the_table_and_page_list():
    free = get_free_quests_from_category_page(BeautifulSoup(FREE_CATEGORY_PAGE, 'html.parser'))

    assert free == ['Acid Wit', 'Made to Order', 'Redemption', 'Redemption (quest)']


def test_get_free_sources_lets_a_pack_win_and_reports_the_clash(capsys):
    free = get_free_sources(['Acid Wit', 'Packed Quest', 'Acid Wit'], {'Packed Quest': 'Some Pack'})

    assert free == ['Acid Wit']
    assert "'Packed Quest' is also in pack 'Some Pack'" in capsys.readouterr().out


def test_get_pack_releases_from_page_dates_packs_by_the_release_cells_sort_key():
    # The header is "Release<br>Date"; the cell shows the update, and its
    # sort key is the release date in seconds since 1970.
    html = '''
    <table class="wikitable sortable">
      <tr><th>Name of the pass</th><th>Release<br/>Date</th><th>Levels</th></tr>
      <tr>
        <td><a href="/page/Keep_on_the_Borderlands" title="Keep on the Borderlands">Keep on the Borderlands</a></td>
        <td data-sort-value="1573603200"><a href="/page/Update_44" title="Update 44">Update 44</a></td>
        <td>1 to 2</td>
      </tr>
      <tr>
        <td><a href="/page/Reaver%27s_Refuge" title="Reaver's Refuge">The Reaver's Reach</a></td>
        <td data-sort-value="1225238400">Module 8</td>
        <td>17</td>
      </tr>
      <tr><td>No Date Yet</td><td>Update 99</td><td>40</td></tr>
    </table>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_pack_releases_from_page(soup) == {
        'Keep on the Borderlands': '2019-11-13',
        "Reaver's Reach": '2008-10-29',
    }


def test_get_pack_releases_from_page_reads_the_expansion_tables_released_column():
    html = '''
    <table class="wikitable">
      <tr><th>Name of the pack</th><th>Released</th></tr>
      <tr>
        <td><a href="/page/Mists_of_Ravenloft" title="Mists of Ravenloft">Mists of Ravenloft</a></td>
        <td data-sort-value="1512518400">Update 37 (Dec 6, 2017)</td>
      </tr>
    </table>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_pack_releases_from_page(soup) == {'Mists of Ravenloft': '2017-12-06'}


def test_get_pack_info_marks_expansions_and_dates_them_by_their_launch():
    # Feywild reached the DDO Store, and so the adventure pack table, months
    # after it launched as an expansion.
    assert get_pack_info(
        {'Fables of the Feywild': '2021-02-24', 'The Red Fens': '2010-08-17'},
        {'Fables of the Feywild': '2020-11-05'},
    ) == {
        'Fables of the Feywild': {'released': '2020-11-05', 'expansion': True},
        'The Red Fens': {'released': '2010-08-17', 'expansion': False},
    }


COUPON_PAGE = '''
<div id="mw-content-text">
  <ul>
    <li><mark id="DDOFREEQUESTS">DDOFREEQUESTS   </mark> <small>(Available from: June 3\u200d–\u200dAugust 31, 2020)</small></li>
    <li><mark id="GATHERYOURPARTY2025">GATHERYOURPARTY2025</mark>
      <ul><li>Alternative social media code: <mark id="LETSPARTY2025">LETSPARTY2025</mark></li></ul>
    </li>
    <li><mark id="BIGBYISBETTER">BIGBYISBETTER</mark></li>
  </ul>
  <table class="wikitable sortable">
    <tr>
      <th>Release Date</th>
      <th><abbr title="June 3\u200d–\u200dAugust 31, 2020">2020</abbr></th>
      <th><abbr title="October 2\u200d–\u200dDecember 31, 2025">2025</abbr></th>
      <th><abbr title="October 14\u200d–\u200dNovember 10, 2026">BIG26</abbr></th>
      <th>Content Granted</th>
      <th>Cost</th>
    </tr>
    <tr>
      <td>Apr 5, 2006</td>
      <td data-sort-value="1">Y</td><td data-sort-value="1">Y</td><td data-sort-value="0">N</td>
      <td><a href="/page/Vault_of_Night" title="Vault of Night">Vault of Night</a></td><td>750</td>
    </tr>
    <tr>
      <td>Aug 31, 2009</td>
      <td data-sort-value="0">N</td><td data-sort-value="1">Y</td><td data-sort-value="0">N</td>
      <td><a href="/page/Favored_Soul" title="Favored Soul">Favored Soul</a></td><td>995</td>
    </tr>
    <tr>
      <td>Nov 9, 2022</td>
      <td data-sort-value="-1">-</td><td data-sort-value="1">Y</td><td data-sort-value="0">N</td>
      <td><a href="/page/Grip_of_the_Hidden_Hand" title="Grip of the Hidden Hand">Grip of the Hidden Hand</a></td><td>725</td>
    </tr>
    <tr>
      <td>Dec 6, 2017</td>
      <td data-sort-value="0">N</td><td data-sort-value="0">N</td><td data-sort-value="1">Y</td>
      <td><a href="/page/Mists_of_Ravenloft" title="Mists of Ravenloft">Mists of Ravenloft</a></td><td>2,495</td>
    </tr>
  </table>
</div>
'''
COUPON_PACKS = {'The Vault of Night', 'Grip of the Hidden Hand', 'Mists of Ravenloft'}


def test_get_coupons_from_page_reads_a_coupon_per_column_with_the_packs_it_ticks():
    # The table spells Vault of Night without its "The"; Favored Soul is a
    # class, not a pack; the nested alternative code isn't a coupon.
    soup = BeautifulSoup(COUPON_PAGE, 'html.parser')

    assert get_coupons_from_page(soup, COUPON_PACKS) == [
        {'label': '2020', 'available': 'June 3–August 31, 2020', 'code': 'DDOFREEQUESTS', 'packs': ['The Vault of Night']},
        {
            'label': '2025',
            'available': 'October 2–December 31, 2025',
            'code': 'GATHERYOURPARTY2025',
            'packs': ['Grip of the Hidden Hand', 'The Vault of Night'],
        },
        {'label': 'BIG26', 'available': 'October 14–November 10, 2026', 'code': 'BIGBYISBETTER', 'packs': ['Mists of Ravenloft']},
    ]


def test_get_coupons_from_page_leaves_codes_out_when_the_list_and_table_disagree():
    html = COUPON_PAGE.replace('<li><mark id="BIGBYISBETTER">BIGBYISBETTER</mark></li>', '')
    soup = BeautifulSoup(html, 'html.parser')

    coupons = get_coupons_from_page(soup, COUPON_PACKS)

    assert [coupon['label'] for coupon in coupons] == ['2020', '2025', 'BIG26']
    assert [coupon['code'] for coupon in coupons] == ['', '', '']


def test_get_coupons_from_page_grants_an_expansions_own_packs_with_it():
    html = COUPON_PAGE.replace('Mists_of_Ravenloft', 'Shadowfell_Conspiracy').replace('Mists of Ravenloft', 'Shadowfell Conspiracy')
    soup = BeautifulSoup(html, 'html.parser')

    coupons = get_coupons_from_page(soup, {'Shadowfell Conspiracy', 'Shadow Over Wheloon', 'The Secret of the Storm Horns'})

    assert coupons[-1]['packs'] == ['Shadow Over Wheloon', 'Shadowfell Conspiracy', 'The Secret of the Storm Horns']
