import os
import json
from datetime import datetime

from build import DATA_BUILDER_DIR, ensure_data_builder_cwd, write_build_info


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
