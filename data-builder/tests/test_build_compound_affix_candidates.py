import build_compound_affix_candidates


def test_build_compound_affix_candidates_filters_obvious_noise(monkeypatch):
    monkeypatch.setattr(build_compound_affix_candidates, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(build_compound_affix_candidates, '_load_existing_affix_groups', lambda: set())

    candidates = build_compound_affix_candidates.build_compound_affix_candidates([
        {
            'name': 'Useful Item',
            'url': '/page/Item:Useful_Item',
            'affixes': [
                {
                    'name': 'Kinetic Lore',
                    'type': 'Equipment',
                    'value': 15,
                    'sourceText': 'Kinetic Lore +15%',
                    'sourceTooltip': (
                        'Kinetic Lore +15: Passive: Your Force, Physical and Untyped spells '
                        'gain a 15% Equipment bonus to their chance to critical hit.'
                    ),
                },
                {
                    'name': '+15',
                    'type': 'Bool',
                    'value': 1,
                    'sourceText': 'Sacred +15',
                    'sourceTooltip': 'Sacred +15: +15 Enhancement bonus to Turn Undead.',
                },
                {'name': 'Acid Shot', 'type': 'Bool', 'value': 1},
                {
                    'name': 'Aid clicky',
                    'type': 'Bool',
                    'value': 1,
                    'sourceText': 'Aid clicky',
                    'sourceTooltip': 'Aid Caster level: 3 Charges: 1 (1/day)',
                },
            ],
        },
    ])

    assert [candidate['affixName'] for candidate in candidates] == ['Kinetic Lore']
    assert candidates[0]['candidatePriority'] == 'high'


def test_build_compound_affix_candidates_marks_existing_groups_for_manual_review(monkeypatch):
    monkeypatch.setattr(build_compound_affix_candidates, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(build_compound_affix_candidates, '_load_existing_affix_groups', lambda: {'Songblade'})

    candidates = build_compound_affix_candidates.build_compound_affix_candidates([
        {
            'name': "Gwylan's Blade",
            'url': '/page/Item:Gwylan%27s_Blade',
            'affixes': [
                {
                    'name': 'Songblade',
                    'type': 'Bool',
                    'value': 1,
                    'sourceText': 'Songblade',
                    'sourceTooltip': 'Songblade: +2 enhancement bonus to the Perform skill.',
                },
            ],
        },
    ])

    assert candidates[0]['candidatePriority'] == 'manual-affix-group'


def test_build_compound_affix_candidates_prioritizes_bool_multi_effects(monkeypatch):
    monkeypatch.setattr(build_compound_affix_candidates, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(build_compound_affix_candidates, '_load_existing_affix_groups', lambda: set())

    candidates = build_compound_affix_candidates.build_compound_affix_candidates([
        {
            'name': 'Ghostly Item',
            'url': '/page/Item:Ghostly_Item',
            'affixes': [
                {
                    'name': 'Ghostly',
                    'type': 'Bool',
                    'value': 1,
                    'sourceText': 'Ghostly',
                    'sourceTooltip': (
                        'Ghostly: Enemy attacks have a 10% chance to miss you due to incorporeality. '
                        'You receive a +5 enhancement bonus to your Hide and Move Silently skills.'
                    ),
                },
            ],
        },
    ])

    assert candidates[0]['candidatePriority'] == 'high'


def test_build_compound_affix_candidates_keeps_damage_procs_low_priority(monkeypatch):
    monkeypatch.setattr(build_compound_affix_candidates, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(build_compound_affix_candidates, '_load_existing_affix_groups', lambda: set())

    candidates = build_compound_affix_candidates.build_compound_affix_candidates([
        {
            'name': 'Proc Item',
            'url': '/page/Item:Proc_Item',
            'affixes': [
                {
                    'name': 'Acid Guard',
                    'type': 'Bool',
                    'value': 1,
                    'sourceText': 'Acid Guard',
                    'sourceTooltip': 'Acid Guard +2: Chance to deal 2d8 Acid damage when hit.',
                },
            ],
        },
    ])

    assert candidates[0]['candidatePriority'] == 'low-damage-proc'


def test_build_compound_affix_candidates_filters_temporary_stacking_effects(monkeypatch):
    monkeypatch.setattr(build_compound_affix_candidates, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(build_compound_affix_candidates, '_load_existing_affix_groups', lambda: set())

    candidates = build_compound_affix_candidates.build_compound_affix_candidates([
        {
            'name': 'Legendary Echo of Blackrazor',
            'url': '/page/Item:Legendary_Echo_of_Blackrazor',
            'affixes': [
                {
                    'name': 'Legendary Stealer of Souls',
                    'type': 'Bool',
                    'value': 1,
                    'sourceText': 'Legendary Stealer of Souls',
                    'sourceTooltip': (
                        'Legendary Stealer of Souls: When you strike the killing blow on an enemy, '
                        'Blackrazor retains one Defeated Soul, up to a maximum of 20. Each Defeated Soul '
                        'grants you +1 Profane bonus to Melee Power and +1 Profane bonus to Damage. '
                        'If you block or unequip Blackrazor, the Defeated Souls will be released. '
                        'Defeated Souls last for 30 seconds.'
                    ),
                },
            ],
        },
    ])

    assert candidates == []


def test_build_compound_affix_candidates_repairs_truncated_name_from_provenance(monkeypatch):
    monkeypatch.setattr(build_compound_affix_candidates, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(build_compound_affix_candidates, '_load_existing_affix_groups', lambda: set())

    candidates = build_compound_affix_candidates.build_compound_affix_candidates([
        {
            'name': 'Creeping Dust Conduit',
            'url': '/page/Item:Creeping_Dust_Conduit',
            'affixes': [
                {
                    'name': 'cst Lore',
                    'type': 'Equipment',
                    'value': '14',
                    'sourceText': (
                        'Creeping Dust Lore +14%Creeping Dust Lore +14: Passive: Your Cold and Acid spells '
                        'gain a 14% Equipment bonus to their chance to critical hit.'
                    ),
                    'sourceTooltip': (
                        'Creeping Dust Lore +14: Passive: Your Cold and Acid spells gain a 14% Equipment bonus '
                        'to their chance to critical hit.'
                    ),
                },
            ],
        },
    ])

    assert candidates[0]['affixName'] == 'Creeping Dust Lore'
    assert candidates[0]['candidatePriority'] == 'high'


def test_build_compound_affix_candidates_prefers_tooltip_label_over_glued_source_text(monkeypatch):
    monkeypatch.setattr(build_compound_affix_candidates, 'load_compound_affixes', lambda: {})
    monkeypatch.setattr(build_compound_affix_candidates, '_load_existing_affix_groups', lambda: {'Sheltering'})

    candidates = build_compound_affix_candidates.build_compound_affix_candidates([
        {
            'name': 'Crystalline Cacophony',
            'url': '/page/Item:Crystalline_Cacophony',
            'affixes': [
                {
                    'name': 'Sheltering',
                    'type': 'Enhancement',
                    'value': '10',
                    'sourceText': 'Sheltering +10 Sheltering +10: +10 Enhancement bonus to Physical and Magical Resistance Ratings',
                    'sourceTooltip': 'Sheltering +10: +10 Enhancement bonus to Physical and Magical Resistance Ratings',
                },
            ],
        },
    ])

    assert candidates[0]['affixName'] == 'Sheltering'
    assert candidates[0]['candidatePriority'] == 'manual-affix-group'


def test_read_items_for_candidates_prefers_provenance_assets(monkeypatch, tmp_path):
    provenance_path = tmp_path / 'items.json'
    provenance_path.write_text('[{"name": "Provenance Item", "affixes": []}]', encoding='utf8')

    monkeypatch.setattr(build_compound_affix_candidates, 'get_provenance_json_path', lambda file_name: str(provenance_path))
    monkeypatch.setattr(build_compound_affix_candidates, 'read_json', lambda file_name: [{'name': 'Regular Item', 'affixes': []}])

    assert build_compound_affix_candidates.read_items_for_candidates() == [{'name': 'Provenance Item', 'affixes': []}]
