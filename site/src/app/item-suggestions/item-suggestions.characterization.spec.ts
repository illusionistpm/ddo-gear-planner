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

  function suggestedNames(section = '.suggested-items'): string[] {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll(`${section} .suggestion-equip-button`);
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

  it('lists minor artifacts apart from the other suggestions', () => {
    open('Trinket', meleeTracked());
    const gearDB = TestBed.inject(GearDbService);
    const isArtifact = (name: string) => gearDB.getFilteredGearBySlot('Trinket')!.find(item => item.name === name)!.artifact;

    const artifacts = suggestedNames('.suggested-artifacts');
    expect(artifacts.length).toBeGreaterThan(0);
    expect(artifacts.length).toBeLessThanOrEqual(3);
    expect(artifacts.every(isArtifact)).toBe(true);
    expect(suggestedNames().some(isArtifact)).toBe(false);
  });

  it('shows copies, so crafting changed in the drawer never touches the gear database', () => {
    open('Belt', meleeTracked());
    const component = fixture.componentInstance;
    const database = new Set(TestBed.inject(GearDbService).getFilteredGearBySlot('Belt'));

    expect(component.gear.length).toBeGreaterThan(0);
    expect([...component.gear, ...component.artifacts].some(item => database.has(item))).toBe(false);
  });

  it('offers no artifact list once another slot holds an artifact', () => {
    const gearDB = TestBed.inject(GearDbService);
    TestBed.inject(EquippedService).set(gearDB.getFilteredGearBySlot('Ring1')!.find(item => item.artifact)!);
    open('Trinket', meleeTracked());

    expect(suggestedNames('.suggested-artifacts')).toEqual([]);
  });
});

// From scorer v2, minor artifacts listed apart. The earlier scorer led with Doctor Lifestone's
// Hunting Horn, Legendary Bottle of Smoke, Legendary Pearl of Uncanny Prediction, Echo of the Icon
// and Legendary Periapt of Strength; Legendary Heartshard is the Trinket most saved endgame builds wear.
// Own crafting at three quarters (OWN_CRAFTING_CREDIT) put Bauble of Draconic Resistance ahead of
// Legendary Mark of the Dark Powers.
const TODAYS_TOP_TRINKETS: string[] = [
  'Legendary Heartshard',
  'The Bloodstained Letter',
  'Legendary Tiny Brain in a Tiny Jar',
  'Bauble of Draconic Resistance',
  'Legendary Golden Souvenir Coin',
];
