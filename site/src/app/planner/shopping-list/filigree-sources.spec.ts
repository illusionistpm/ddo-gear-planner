import { TestBed } from '@angular/core/testing';

import { FiligreeDbService } from '../../gear/filigree-db.service';
import { filigreeSources, filigreeWikiUrl } from './filigree-sources';

describe('filigree shopping sources', () => {
  let db: FiligreeDbService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    db = TestBed.inject(FiligreeDbService);
  });

  it('sends a generation\'s filigree to any quest of each of its packs', () => {
    expect(filigreeSources(db, 'Celerity: Dexterity')).toEqual([
      expect.objectContaining({ quest: 'Any Mists of Ravenloft quest', pack: 'Mists of Ravenloft', raid: false }),
      expect.objectContaining({ quest: 'Any Disciples of Rage quest', pack: 'Disciples of Rage' }),
      expect.objectContaining({ quest: 'Any White Plume Mountain and Other Tales quest', pack: 'White Plume Mountain and Other Tales' }),
    ]);
  });

  it('sends a raid filigree to Threads of Fate', () => {
    expect(filigreeSources(db, 'Celerity/Vigilance: Wisdom')).toEqual([{
      quest: 'Thread of Fate', pack: null, raid: true, wikiUrl: 'https://ddowiki.com/page/Item:Thread_of_Fate',
    }]);
  });

  it('sends an event filigree to the events', () => {
    expect(filigreeSources(db, "Snowpeak's Gifts: Movement Speed")).toEqual([
      expect.objectContaining({ quest: 'Seasonal events', pack: 'Events' }),
    ]);
  });

  it('links to the filigree list at the filigree\'s set', () => {
    expect(filigreeWikiUrl(db, 'Celerity: Dexterity')).toBe('https://ddowiki.com/page/Sentient_Weapon/Filigrees#Celerity');
    expect(filigreeSources(db, 'No Such Filigree')).toEqual([]);
  });
});
