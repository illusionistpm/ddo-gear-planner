import pytest
from bs4 import BeautifulSoup

from parse_minor_artifacts import (
    FILIGREE_AFFIX_NAME,
    MAX_ARTIFACTS_WITHOUT_TIP,
    apply_artifacts,
    check_filigree_tips,
    get_artifacts_from_page,
)


def tip_row(name, tip):
    return f'''
        <tr>
            <td><b><a href="/page/Item:{name}">{name}</a></b></td>
            <td>Some quest<hr />{tip}</td>
        </tr>'''


def artifact_page(rows):
    return BeautifulSoup(f'''
        <div id="bodyContent"><div id="mw-content-text"><div>
        <table class="wikitable"><tbody>
            <tr><th>Item</th><th>Quests<hr />Tips</th></tr>
            {''.join(rows)}
        </tbody></table>
        </div></div></div>
    ''', 'html.parser')


def tip(n):
    return f'<p>This <a href="/page/Minor_Artifact">Minor Artifact</a> has a maximum of {n} filigree\nslots.</p>'


def test_reads_the_filigree_count_from_each_row():
    soup = artifact_page([tip_row('Alpha', tip(3)), tip_row('Beta', tip(5))])

    assert get_artifacts_from_page(soup) == {'Alpha': 3, 'Beta': 5}


def test_row_without_a_tip_is_none():
    soup = artifact_page([tip_row('Alpha', tip(3)), tip_row('Beta', '<p>Nothing useful</p>')])

    assert get_artifacts_from_page(soup) == {'Alpha': 3, 'Beta': None}


def test_apply_tags_artifacts_and_adds_the_affix():
    items = [
        {'name': 'Alpha', 'affixes': [{'name': 'Dexterity', 'type': 'Enhancement', 'value': '14'}]},
        {'name': 'Plain', 'affixes': []},
    ]

    apply_artifacts(items, {'Alpha': 3})

    assert items[0]['artifact'] is True
    assert items[0]['affixes'][0] == {'name': FILIGREE_AFFIX_NAME, 'type': 'Untyped', 'value': '3'}
    assert items[0]['affixes'][1]['name'] == 'Dexterity'
    assert 'artifact' not in items[1]
    assert items[1]['affixes'] == []


def test_apply_replaces_the_unrecognised_bool_enchantment():
    junk = {'name': 'This Minor Artifact has a maximum of 3 filigree slots.', 'type': 'Bool', 'value': 1}
    items = [{'name': 'Alpha', 'affixes': [junk, {'name': 'Dexterity', 'type': 'Enhancement', 'value': '14'}]}]

    apply_artifacts(items, {'Alpha': 3})

    names = [a['name'] for a in items[0]['affixes']]
    assert names == [FILIGREE_AFFIX_NAME, 'Dexterity']


def test_apply_leaves_an_artifact_without_a_tip_alone():
    items = [{'name': 'Alpha', 'affixes': []}]

    apply_artifacts(items, {'Alpha': None})

    assert items[0] == {'name': 'Alpha', 'affixes': [], 'artifact': True}


def test_a_single_missing_tip_is_tolerated():
    check_filigree_tips({'Alpha': 3, 'Beta': None})


def test_too_many_missing_tips_fails_the_build():
    artifacts = {f'A{i}': 3 for i in range(10)}
    for i in range(MAX_ARTIFACTS_WITHOUT_TIP + 1):
        artifacts[f'A{i}'] = None

    with pytest.raises(ValueError, match='wiki page has probably changed'):
        check_filigree_tips(artifacts)


def test_no_tips_at_all_fails_the_build():
    with pytest.raises(ValueError):
        check_filigree_tips({'Alpha': None})


def test_apply_is_idempotent():
    items = [{'name': 'Alpha', 'affixes': []}]

    apply_artifacts(items, {'Alpha': 3})
    apply_artifacts(items, {'Alpha': 3})

    assert [a['name'] for a in items[0]['affixes']] == [FILIGREE_AFFIX_NAME]
