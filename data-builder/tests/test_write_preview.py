import subprocess

import write_preview


def _git(repo, *args):
    subprocess.run(['git', *args], cwd=repo, check=True, capture_output=True)


def _make_repo(tmp_path, monkeypatch):
    repo = tmp_path / 'repo'
    data = repo / 'data'
    builder = repo / 'data-builder'
    data.mkdir(parents=True)
    builder.mkdir()
    (data / 'items.json').write_text('{"a": 1}\n', encoding='utf8')
    (data / 'sets.json').write_text('{}\n', encoding='utf8')
    (builder / 'source_packs.json').write_text('{}\n', encoding='utf8')

    _git(repo, 'init', '-q')
    _git(repo, 'add', '.')
    _git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'base')

    monkeypatch.setattr(write_preview, 'get_output_path', lambda: str(data))
    monkeypatch.setattr(write_preview, 'SOURCE_PACKS_PATH', str(builder / 'source_packs.json'))
    monkeypatch.setattr(write_preview, 'SNAPSHOT_DIR', str(repo / 'wiki-snapshot'))
    return repo


def test_preview_holds_every_output_a_diff_and_a_summary(tmp_path, monkeypatch):
    repo = _make_repo(tmp_path, monkeypatch)
    (repo / 'data' / 'items.json').write_text('{"a": 2}\n', encoding='utf8')
    (repo / 'data-builder' / 'source_packs.json').write_text('{"Device": "Pack"}\n', encoding='utf8')
    preview = tmp_path / 'preview'

    write_preview.write_preview(str(preview), 'Items: 1 (+0)')

    assert (preview / 'data' / 'items.json').read_text(encoding='utf8') == '{"a": 2}\n'
    assert (preview / 'data' / 'sets.json').exists()
    assert (preview / 'data-builder' / 'source_packs.json').read_text(encoding='utf8') == '{"Device": "Pack"}\n'

    diff = (preview / 'data.diff').read_text(encoding='utf8')
    assert '+{"a": 2}' in diff
    assert '+{"Device": "Pack"}' in diff
    assert 'sets.json' not in diff

    summary = (preview / 'summary.md').read_text(encoding='utf8')
    assert 'Items: 1 (+0)' in summary
    assert 'data/items.json' in summary
    assert 'data-builder/source_packs.json' in summary


def test_preview_with_no_changes_says_so(tmp_path, monkeypatch):
    _make_repo(tmp_path, monkeypatch)
    preview = tmp_path / 'preview'

    write_preview.write_preview(str(preview), 'Items: 1 (+0)')

    assert (preview / 'data.diff').read_text(encoding='utf8') == ''
    assert 'No changes to checked-in files.' in (preview / 'summary.md').read_text(encoding='utf8')


def test_preview_copies_snapshot_pages_the_committed_snapshot_lacks(tmp_path, monkeypatch):
    repo = _make_repo(tmp_path, monkeypatch)
    snapshot = repo / 'wiki-snapshot'
    (snapshot / 'items').mkdir(parents=True)
    (snapshot / 'items' / 'Old.html').write_text('<old/>', encoding='utf8')
    _git(repo, 'add', '.')
    _git(repo, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'snapshot')
    (snapshot / 'items' / 'Old.html').write_text('<redownloaded/>', encoding='utf8')
    (snapshot / 'new_pages').mkdir()
    (snapshot / 'new_pages' / 'New.html').write_text('<new/>', encoding='utf8')
    preview = tmp_path / 'preview'

    write_preview.write_preview(str(preview), 'Items: 1 (+0)')

    assert (preview / 'wiki-snapshot' / 'new_pages' / 'New.html').read_text(encoding='utf8') == '<new/>'
    assert not (preview / 'wiki-snapshot' / 'items').exists()
    assert 'wiki-snapshot/new_pages/New.html' in (preview / 'summary.md').read_text(encoding='utf8')
