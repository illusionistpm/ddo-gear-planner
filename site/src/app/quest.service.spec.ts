import { TestBed } from '@angular/core/testing';

import { QuestService } from './quest.service';
import { Item } from './item';

describe('QuestService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: QuestService = TestBed.inject(QuestService);
    expect(service).toBeTruthy();
  });

  it('treats regular raid drops as raid loot', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const item = new Item({
      name: 'Regular Raid Drop',
      quests: ['Too Hot to Handle'],
    });

    expect(service.isRaidLoot(item)).toBeTrue();
  });

  it('treats Ritual Table crafted items as raid loot', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const item = new Item({
      name: 'Bastard Sword of the Undying Age',
      quests: ['Ritual Table'],
    });

    expect(service.isRaidLoot(item)).toBeTrue();
  });

  it('does not treat Sharn quest rare drops as raid loot', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const item = new Item({
      name: 'Sigil of Regalport',
      pack: 'Masterminds of Sharn',
      rare: true,
      quests: ['Sharn quests'],
    });

    expect(service.isRaidLoot(item)).toBeFalse();
  });

  it('uses normalized Sharn quests source labels directly', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const item = new Item({
      name: 'Sigil of Regalport',
      pack: 'Masterminds of Sharn',
      rare: true,
      quests: ['Sharn quests'],
    });

    expect(service.getLootSourceLabel(item)).toBe('Sharn quests');
  });

  it('uses the first quest as the default loot source label', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const item = new Item({
      name: 'Regular Quest Drop',
      quests: ['The Snitch', 'Partycrashers'],
    });

    expect(service.getLootSourceLabel(item)).toBe('The Snitch');
  });
});
