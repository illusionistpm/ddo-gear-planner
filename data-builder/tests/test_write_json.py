import json
import shutil
from pathlib import Path

import write_json


def test_write_json_normalizes_mixed_separator_output_path(monkeypatch):
    temp_root = Path(__file__).parent / '.tmp-write-json'
    shutil.rmtree(temp_root, ignore_errors=True)
    mixed_output_path = str(temp_root / 'nested') + '/../nested/assets'
    monkeypatch.setattr(write_json, 'get_output_path', lambda: mixed_output_path)

    try:
        write_json.write_json({'b': 2, 'a': 1}, 'sample')

        output_path = temp_root / 'nested' / 'assets' / 'sample.json'
        assert json.loads(output_path.read_text(encoding='utf8')) == {'a': 1, 'b': 2}
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)
