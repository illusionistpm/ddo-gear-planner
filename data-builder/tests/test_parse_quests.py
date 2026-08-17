from bs4 import BeautifulSoup

from parse_quests import add_crafting_raid_sources, get_adventure_pack_name_map_from_page, get_expansion_pack_pages_from_category, get_quest_pack_map_from_pack_page, get_quest_pack_map_from_sectioned_page


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
