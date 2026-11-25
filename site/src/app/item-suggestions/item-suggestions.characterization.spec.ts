import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { AffixPackagesService } from '../affixes/affix-packages.service';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { ItemSuggestionsComponent } from './item-suggestions.component';

/**
 * Pins what a slot's suggestion drawer shows today, through its rendered DOM, before the scorer
 * behind it was replaced (docs/suggestions-analysis.md, "Scorer v2"). The ordering snapshot changed
 * with the new scorer, on purpose; the rest held, bar the ranking test now saying "can add".
 */
describe('ItemSuggestionsComponent (characterization)', () => {
  let fixture: ComponentFixture<ItemSuggestionsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
  });

  function open(slot: string, tracked: string[], levelRange: [number, number] = [28, 34]) {
    // GearDbService first: creating it sets the filters' max level, which resets the range.
    TestBed.inject(GearDbService);
    TestBed.inject(FiltersService).setLevelRange(...levelRange);
    TestBed.inject(EquippedService).setImportantAffixes(tracked);
    fixture = TestBed.createComponent(ItemSuggestionsComponent);
    fixture.componentInstance.slot = slot;
    fixture.detectChanges();
  }

  function suggestedNames(): string[] {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('.suggestion-equip-button');
    return Array.from(rows).map(button => button.closest('.row')?.querySelector('span.col')?.textContent?.trim() ?? '');
  }

  function meleeTracked(): string[] {
    const packages = TestBed.inject(AffixPackagesService);
    return [...packages.packages.get('Basic')!, ...packages.packages.get('Melee')!, 'Strength'];
  }

  it('lists at most 20 suggestions', () => {
    open('Trinket', meleeTracked());
    expect(suggestedNames().length).toBe(20);
  });

  // Scorer v2 credits an item's own crafting slots, so an item can add a tracked affix without
  // carrying it: what ranks first is any item that can add it, built in or through its crafting.
  it('ranks items that can add a tracked affix above items that cannot', () => {
    open('Trinket', ['Seeker']);
    const names = suggestedNames();
    const gearDB = TestBed.inject(GearDbService);
    const canAdd = (name: string) => {
      const item = gearDB.getFilteredGearBySlot('Trinket')!.find(candidate => candidate.name === name)!;
      return item.affixes.some(affix => affix.name === 'Seeker')
        || (item.crafting ?? []).some(craftable => craftable.options.some(option => option.affixes.some(affix => affix.name === 'Seeker')));
    };
    const firstWithout = names.findIndex(name => !canAdd(name));
    const lastWith = names.map(canAdd).lastIndexOf(true);
    expect(lastWith).toBeGreaterThanOrEqual(0);
    if (firstWithout >= 0) {
      expect(lastWith).toBeLessThan(firstWithout);
    }
  });

  it('suggests these Trinkets first for a melee build at level 28-34', () => {
    open('Trinket', meleeTracked());
    expect(suggestedNames().slice(0, 5)).toEqual(TODAYS_TOP_TRINKETS);
  });
});

// From scorer v2. The earlier scorer led with Doctor Lifestone's Hunting Horn, Legendary Bottle of
// Smoke, Legendary Pearl of Uncanny Prediction, Echo of the Icon and Legendary Periapt of Strength.
// Legendary Heartshard is the Trinket most saved endgame builds wear; The Hydra's Heart and Perfected
// Bloodstone are minor artifacts, ranked with the rest while the drawer has no artifact list of its own.
const TODAYS_TOP_TRINKETS: string[] = [
  "The Hydra's Heart",
  'Legendary Heartshard',
  'The Bloodstained Letter',
  'Perfected Bloodstone',
  'Legendary Tiny Brain in a Tiny Jar',
];
