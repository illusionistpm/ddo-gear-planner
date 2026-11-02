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
      slot: 'Trinket',
      ml: 1,
      name: 'Regular Raid Drop',
      quests: ['Too Hot to Handle'],
    });

    expect(service.isRaidLoot(item)).toBe(true);
  });

  it('treats Ritual Table crafted items as raid loot', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const item = new Item({
      slot: 'Trinket',
      ml: 1,
      name: 'Bastard Sword of the Undying Age',
      quests: ['Ritual Table'],
    });

    expect(service.isRaidLoot(item)).toBe(true);
  });

  it('does not treat Sharn quest rare drops as raid loot', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const item = new Item({
      slot: 'Trinket',
      ml: 1,
      name: 'Sigil of Regalport',
      rare: true,
      quests: ['Sharn quests'],
    });

    expect(service.isRaidLoot(item)).toBe(false);
  });

  it('uses normalized Sharn quests source labels directly', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const item = new Item({
      slot: 'Trinket',
      ml: 1,
      name: 'Sigil of Regalport',
      rare: true,
      quests: ['Sharn quests'],
    });

    expect(service.getLootSourceLabel(item)).toBe('Sharn quests');
  });

  it('looks up the pack a quest belongs to', () => {
    const service: QuestService = TestBed.inject(QuestService);

    expect(service.getPack('A Blood Pact')).toBe('Terror of Demogorgon');
    expect(service.getPack('No Such Quest')).toBeNull();
    expect(service.getPack('constructor')).toBeNull();
  });

  it('uses the first quest as the default loot source label', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const item = new Item({
      slot: 'Trinket',
      ml: 1,
      name: 'Regular Quest Drop',
      quests: ['The Snitch', 'Partycrashers'],
    });

    expect(service.getLootSourceLabel(item)).toBe('The Snitch');
  });

  it('treats only items with every source a raid as raid loot', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const raidOnly = new Item({ slot: 'Trinket', ml: 1, name: 'Raid Only', quests: ['Too Hot to Handle'] });
    const raidOrQuest = new Item({ slot: 'Trinket', ml: 1, name: 'Raid Or Quest', quests: ['Too Hot to Handle', 'Book Burning'] });
    const noSource = new Item({ slot: 'Trinket', ml: 1, name: 'No Source' });

    expect(service.isRaidLoot(raidOnly)).toBe(true);
    expect(service.isRaidLoot(raidOrQuest)).toBe(false);
    expect(service.isRaidLoot(noSource)).toBe(false);
  });

  it('looks up the pack of a source', () => {
    const service: QuestService = TestBed.inject(QuestService);

    expect(service.getPack('Book Burning')).toBe('Magic of Myth Drannor');
    expect(service.getPack('Not A Mapped Source')).toBeNull();
  });

  it('lists every loot source in order', () => {
    const service: QuestService = TestBed.inject(QuestService);
    const item = new Item({ slot: 'Trinket', ml: 1, name: 'Two Drops', quests: ['The Snitch', 'Partycrashers'] });

    expect(service.getLootSources(item)).toEqual(['The Snitch', 'Partycrashers']);
    expect(service.getLootSources(null)).toEqual([]);
  });
});
