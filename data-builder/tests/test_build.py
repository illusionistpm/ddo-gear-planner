import os

from build import DATA_BUILDER_DIR, ensure_data_builder_cwd


def test_ensure_data_builder_cwd_allows_build_from_repo_root(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)

    ensure_data_builder_cwd()

    assert os.getcwd() == DATA_BUILDER_DIR
