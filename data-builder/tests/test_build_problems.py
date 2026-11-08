from build_problems import DISCORD_MESSAGE_LIMIT, MAX_LISTED, describe_new_problems, format_message, new_audit_issues


def issue(severity, item, text='bad', category='unknown-type'):
    return {'severity': severity, 'category': category, 'item': item, 'affix': 'Strength', 'issue': text}


def test_only_errors_and_warnings_the_build_added_are_new():
    before = [issue('warning', 'Old Sword')]
    after = [issue('warning', 'Old Sword'), issue('info', 'New Sword'), issue('warning', 'New Ring'), issue('error', 'New Helm')]

    assert [i['item'] for i in new_audit_issues(before, after)] == ['New Helm', 'New Ring']


def test_a_clean_build_has_no_problems():
    assert describe_new_problems([issue('error', 'Old Sword')], [issue('error', 'Old Sword')], ['Old Vendor'], ['Old Vendor']) == []


def test_new_issues_and_sources_are_described_with_counts():
    sections = describe_new_problems([], [issue('error', 'Helm'), issue('warning', 'Ring')], ['Old Vendor'], ['Old Vendor', 'New Vendor'])

    assert len(sections) == 2
    assert '1 errors, 1 warnings' in sections[0]
    assert "ERROR unknown-type: Item 'Helm'" in sections[0]
    assert 'New Vendor' in sections[1]
    assert 'Old Vendor' not in sections[1]


def test_a_long_list_is_cut_short():
    sections = describe_new_problems([], [issue('warning', f'Item {n}') for n in range(MAX_LISTED + 5)], [], [])

    assert 'Item 0' in sections[0]
    assert f'Item {MAX_LISTED}' not in sections[0]
    assert '...and 5 more' in sections[0]


def test_a_message_fits_discord_and_keeps_the_run_link():
    message = format_message('Title', ['x' * 5000], 'https://github.com/run/1')

    assert len(message) <= DISCORD_MESSAGE_LIMIT
    assert message.endswith('<https://github.com/run/1>')
