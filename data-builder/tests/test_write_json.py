import json
import shutil
from pathlib import Path

import read_json
import write_json


def test_write_json_writes_stripped_asset_and_provenance_copy(monkeypatch):
    temp_root = Path(__file__).parent / '.tmp-write-json'
    shutil.rmtree(temp_root, ignore_errors=True)
    asset_path = temp_root / 'assets' / 'sample.json'
    provenance_path = temp_root / 'assets' / 'provenance' / 'sample.json'
    monkeypatch.setenv('DDO_AFFIX_PROVENANCE', '1')
    monkeypatch.setattr(write_json, 'get_asset_json_path', lambda name: str(asset_path))
    monkeypatch.setattr(write_json, 'get_provenance_json_path', lambda name: str(provenance_path))

    try:
        write_json.write_json({
            'affixes': [{
                'name': 'Search',
                'type': 'Insight',
                'value': 1,
                'sourceText': 'Search',
                'sourceTooltip': '+1 Insight bonus to Search',
                'parserSource': 'fixture',
            }]
        }, 'sample')

        assert json.loads(asset_path.read_text(encoding='utf8')) == {
            'affixes': [{'name': 'Search', 'type': 'Insight', 'value': 1}]
        }
        assert json.loads(provenance_path.read_text(encoding='utf8'))['affixes'][0]['sourceText'] == 'Search'
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)


def test_read_json_prefers_provenance_copy_when_enabled(monkeypatch):
    temp_root = Path(__file__).parent / '.tmp-read-json'
    shutil.rmtree(temp_root, ignore_errors=True)
    asset_path = temp_root / 'assets' / 'sample.json'
    provenance_path = temp_root / 'assets' / 'provenance' / 'sample.json'
    asset_path.parent.mkdir(parents=True, exist_ok=True)
    provenance_path.parent.mkdir(parents=True, exist_ok=True)
    asset_path.write_text(json.dumps({'source': 'standard'}), encoding='utf8')
    provenance_path.write_text(json.dumps({'source': 'provenance'}), encoding='utf8')
    monkeypatch.setattr(read_json, 'get_asset_json_path', lambda name: str(asset_path))
    monkeypatch.setattr(read_json, 'get_provenance_json_path', lambda name: str(provenance_path))

    try:
        monkeypatch.delenv('DDO_AFFIX_PROVENANCE', raising=False)
        assert read_json.read_json('sample') == {'source': 'standard'}

        monkeypatch.setenv('DDO_AFFIX_PROVENANCE', '1')
        assert read_json.read_json('sample') == {'source': 'provenance'}
    finally:
        shutil.rmtree(temp_root, ignore_errors=True)
