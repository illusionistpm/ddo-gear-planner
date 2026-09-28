import { TestBed } from '@angular/core/testing';

import { AffixSourceHighlightService, NON_GEAR_JUMP_TARGET, setJumpTarget } from './affix-source-highlight.service';
import { AffixSource, EquippedService } from './equipped.service';

describe('AffixSourceHighlightService', () => {
  let service: AffixSourceHighlightService;
  let targets: ReadonlySet<string>;
  let sources: AffixSource[];

  beforeEach(() => {
    sources = [];
    TestBed.configureTestingModule({
      providers: [{ provide: EquippedService, useValue: { getSourcesForAffixType: () => sources } }]
    });
    service = TestBed.inject(AffixSourceHighlightService);
    service.targets$.subscribe(value => targets = value);
  });

  function source(kind: AffixSource['kind'], slot: string, itemName: string): AffixSource {
    return { kind, slot, itemName, affixName: 'Strength', bonusType: 'Enhancement', value: 4 };
  }

  it('starts with nothing highlighted', () => {
    expect(targets.size).toBe(0);
  });

  it('names a slot for an item, the set for a set bonus, and non-gear for a non-gear entry', () => {
    sources = [
      source('item', 'Belt', 'A Belt'),
      source('set', 'Set', 'Some Set'),
      source('external', 'Non-gear', 'A Spell')
    ];

    service.showSourcesOf('Strength', 'Enhancement');

    expect([...targets]).toEqual(['Belt', setJumpTarget('Some Set'), NON_GEAR_JUMP_TARGET]);
  });

  it('highlights every source when several tie', () => {
    sources = [source('item', 'Belt', 'A Belt'), source('item', 'Gloves', 'Some Gloves')];

    service.showSourcesOf('Strength', 'Enhancement');

    expect([...targets]).toEqual(['Belt', 'Gloves']);
  });

  it('clears', () => {
    sources = [source('item', 'Belt', 'A Belt')];
    service.showSourcesOf('Strength', 'Enhancement');

    service.clear();

    expect(targets.size).toBe(0);
  });
});
