from build_crafting import add_sealed_in_fire_crafting


def test_add_sealed_in_fire_crafting_copies_sealed_in_mist_options():
    item_crafting = {
        'Sealed in Mist': {
            '*': [
                {
                    'affixes': [
                        {
                            'name': 'Legendary Dust',
                            'type': 'Bool',
                            'value': 1,
                        },
                    ],
                },
            ],
        },
    }

    add_sealed_in_fire_crafting(item_crafting)

    assert item_crafting['Sealed in Fire'] == item_crafting['Sealed in Mist']
    assert item_crafting['Sealed in Fire'] is not item_crafting['Sealed in Mist']
