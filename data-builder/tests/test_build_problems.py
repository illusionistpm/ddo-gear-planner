from build_problems import DISCORD_MESSAGE_LIMIT, MAX_LISTED, describe_problems, format_message, new_warnings


def issue(severity, item, text='bad', category='unknown-type'):
    return {'severity': severity, 'category': category, 'item': item, 'affix': 'Strength', 'issue': text}


def test_only_warnings_the_build_added_are_new():
    before = [issue('warning', 'Old Sword')]
    after = [issue('warning', 'Old Sword'), issue('info', 'New Sword'), issue('warning', 'New Ring'), issue('error', 'New Helm')]

    assert [i['item'] for i in new_warnings(before, after)] == ['New Ring']


def test_a_clean_build_has_no_problems():
    assert describe_problems([issue('warning', 'Old Sword')], [issue('warning', 'Old Sword'), issue('info', 'Ring')], []) == []


def test_errors_and_unresolved_sources_are_reported_every_build():
    sections = describe_problems([issue('error', 'Old Helm')], [issue('error', 'Old Helm')], ['Old Vendor'])

    assert len(sections) == 2
    assert "Validation errors (1;" in sections[0]
    assert "ERROR unknown-type: Item 'Old Helm'" in sections[0]
    assert 'Old Vendor' in sections[1]


def test_new_warnings_are_reported_after_errors():
    sections = describe_problems([], [issue('warning', 'Ring'), issue('error', 'Helm')], [])

    assert 'Helm' in sections[0]
    assert sections[1].startswith('New validation warnings (1)')
    assert 'Ring' in sections[1]


def test_a_long_list_is_cut_short():
    sections = describe_problems([], [issue('warning', f'Item {n}') for n in range(MAX_LISTED + 5)], [])

    assert 'Item 0' in sections[0]
    assert f'Item {MAX_LISTED}' not in sections[0]
    assert '...and 5 more' in sections[0]


def test_a_message_fits_discord_and_keeps_the_run_link():
    message = format_message('Title', ['x' * 5000], 'https://github.com/run/1')

    assert len(message) <= DISCORD_MESSAGE_LIMIT
    assert message.endswith('<https://github.com/run/1>')
