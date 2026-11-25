import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { AffixPackagesService } from '../affixes/affix-packages.service';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { ItemSuggestionsComponent } from './item-suggestions.component';

/**
 * Pins what a slot's suggestion drawer shows today, through its rendered DOM, before the scorer
 * behind it is replaced (docs/suggestions-analysis.md, "Scorer v2"). The ordering snapshot is
 * expected to change with the new scorer; the rest should hold.
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

  it('ranks items carrying tracked affixes above items carrying none', () => {
    open('Trinket', ['Doublestrike']);
    const names = suggestedNames();
    const gearDB = TestBed.inject(GearDbService);
    const carries = (name: string) => gearDB.getFilteredGearBySlot('Trinket')!
      .find(item => item.name === name)!.affixes.some(affix => affix.name === 'Doublestrike');
    const firstWithout = names.findIndex(name => !carries(name));
    const lastWith = names.map(carries).lastIndexOf(true);
    expect(lastWith).toBeGreaterThanOrEqual(0);
    if (firstWithout >= 0) {
      expect(lastWith).toBeLessThan(firstWithout);
    }
  });

  it('suggests these Trinkets first for a melee build at level 28-34 (today\'s scorer)', () => {
    open('Trinket', meleeTracked());
    expect(suggestedNames().slice(0, 5)).toEqual(TODAYS_TOP_TRINKETS);
  });
});

// Filled in from the current scorer; the scorer v2 change updates it on purpose.
const TODAYS_TOP_TRINKETS: string[] = [
  "Doctor Lifestone's Hunting Horn",
  'Legendary Bottle of Smoke',
  'Legendary Pearl of Uncanny Prediction',
  'Echo of the Icon',
  'Legendary Periapt of Strength',
];
