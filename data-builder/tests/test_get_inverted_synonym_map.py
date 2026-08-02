from get_inverted_synonym_map import get_inverted_synonym_map


def test_synonym_lookup_is_case_insensitive():
    synonym_map = get_inverted_synonym_map()

    assert synonym_map['hit'] == 'Accuracy'
    assert synonym_map['Fortification bypass'] == 'Armor-Piercing'
    assert synonym_map['all spell DCs'] == 'Spell Focus Mastery'
    assert synonym_map['all Ability Scores'] == 'Well Rounded'
