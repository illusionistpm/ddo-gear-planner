import os
import json
import subprocess
from datetime import datetime

import pytest

import build
from build import DATA_BUILDER_DIR, ensure_data_builder_cwd, write_build_info


BUILD_STEPS = [
    'build_synonyms', 'parse_essence_crafting', 'build_affix_groups', 'parse_set_page', 'parse_quests',
    'build_crafting', 'parse_item_augment_page', 'parse_items', 'parse_minor_artifacts', 'parse_filigree', 'parse_item_types',
    'build_url_codec_dictionary',
]


@pytest.fixture
def stubbed_build(monkeypatch, tmp_path):
    """build_data with its unit-test run, downloads and steps replaced by recorders."""
    calls = []
    monkeypatch.setattr(build.subprocess, 'run', lambda *args, **kwargs: subprocess.CompletedProcess(args, 0))
    monkeypatch.setattr(build, 'get_snapshot_path', lambda: str(tmp_path))
    monkeypatch.setattr(build, 'get_data_stats', lambda: {})
    monkeypatch.setattr(build, 'diff_data_stats', lambda new, old: {})
    monkeypatch.setattr(build, 'get_data_stats_description', lambda new, diff: '')
    monkeypatch.setattr(build, 'check_stats_thresholds', lambda new, old: [])
    monkeypatch.setattr(build, 'audit_data', lambda: [])
    monkeypatch.setattr(build, 'get_unresolved_sources_in_data', lambda: [])
    for name in ['download_wiki_pages', 'clear_wiki_snapshot', 'write_build_info', *BUILD_STEPS]:
        monkeypatch.setattr(build, name, lambda name=name: calls.append(name))
    return calls


def test_offline_build_runs_every_step_without_downloading_or_restamping(stubbed_build):
    build.build_data(False, offline=True)

    assert stubbed_build == BUILD_STEPS


def test_online_build_downloads_and_stamps_build_info(stubbed_build):
    build.build_data(True)

    assert stubbed_build == ['clear_wiki_snapshot', 'download_wiki_pages', *BUILD_STEPS, 'write_build_info']


def test_offline_build_without_a_snapshot_stops_before_building(stubbed_build, monkeypatch, tmp_path):
    monkeypatch.setattr(build, 'get_snapshot_path', lambda: str(tmp_path / 'missing'))

    with pytest.raises(SystemExit):
        build.build_data(False, offline=True)

    assert stubbed_build == []


@pytest.fixture
def posts(monkeypatch):
    """Discord posts run() makes, as (title, sections)."""
    sent = []
    monkeypatch.setattr(build, 'post_to_discord', lambda url, title, sections: sent.append((title, sections)))
    return sent


def test_a_clean_build_posts_nothing(stubbed_build, posts):
    build.run(False, 'https://discord.example/hook', offline=True)

    assert posts == []


def test_a_build_with_problems_posts_them(stubbed_build, posts, monkeypatch):
    monkeypatch.setattr(build, 'get_unresolved_sources_in_data', lambda: ['A Vendor'])

    build.run(False, 'https://discord.example/hook', offline=True)

    assert len(posts) == 1
    title, sections = posts[0]
    assert title == 'Data build has problems'
    assert 'A Vendor' in sections[0]


def test_warnings_already_in_the_data_are_not_posted_again(stubbed_build, posts, monkeypatch):
    warning = {'severity': 'warning', 'category': 'duplicate-affix', 'item': 'Sword', 'affix': 'Strength', 'issue': 'twice'}
    monkeypatch.setattr(build, 'audit_data', lambda: [warning])

    build.run(False, 'https://discord.example/hook', offline=True)

    assert posts == []


def test_a_stats_drop_fails_the_build_and_posts_why(stubbed_build, posts, monkeypatch):
    monkeypatch.setattr(build, 'check_stats_thresholds', lambda new, old: ['items - items: dropped 50%'])

    with pytest.raises(SystemExit):
        build.run(False, 'https://discord.example/hook', offline=True)

    assert len(posts) == 1
    title, sections = posts[0]
    assert title == 'Data build failed'
    assert 'items - items: dropped 50%' in sections[0]


def test_a_crash_posts_the_exception(stubbed_build, posts, monkeypatch):
    def broken():
        raise ValueError('Unexpected status 503')
    monkeypatch.setattr(build, 'parse_items', broken)

    with pytest.raises(ValueError):
        build.run(False, 'https://discord.example/hook', offline=True)

    assert posts == [('Data build failed', ['ValueError: Unexpected status 503'])]


def test_a_preview_never_posts(stubbed_build, posts, monkeypatch, tmp_path):
    monkeypatch.setattr(build, 'check_stats_thresholds', lambda new, old: ['items - items: dropped 50%'])
    monkeypatch.setattr(build, 'write_preview', lambda *args: None)

    with pytest.raises(SystemExit):
        build.run(False, 'https://discord.example/hook', str(tmp_path / 'preview'), offline=True)

    assert posts == []


def test_ensure_data_builder_cwd_allows_build_from_repo_root(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)

    ensure_data_builder_cwd()

    assert os.getcwd() == DATA_BUILDER_DIR


def test_write_build_info_writes_parseable_utc_timestamp(monkeypatch, tmp_path):
    output_dir = tmp_path / 'assets'
    monkeypatch.setattr('get_output_path.get_output_path', lambda: str(output_dir))
    monkeypatch.setattr('provenance_io.get_output_path', lambda: str(output_dir))

    write_build_info()

    contents = json.loads((output_dir / 'build-info.json').read_text(encoding='utf8'))
    built_at = contents['builtAt']
    assert datetime.fromisoformat(built_at).tzinfo is not None
