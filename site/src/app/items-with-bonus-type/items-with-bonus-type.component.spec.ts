import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { ItemsWithBonusTypeComponent } from './items-with-bonus-type.component';
import { Item } from '../gear/item';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { AppModule } from '../app.module';
import { ItemPreviewComponent } from '../item-preview/item-preview.component';
import { ExternalAffixFormComponent } from '../external-affix-form/external-affix-form.component';
import { ExternalAffixValueComponent } from '../external-affix-value/external-affix-value.component';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';

describe('ItemsWithBonusTypeComponent', () => {
  let component: ItemsWithBonusTypeComponent;
  let fixture: ComponentFixture<ItemsWithBonusTypeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ItemsWithBonusTypeComponent, ItemPreviewComponent, ExternalAffixFormComponent, ExternalAffixValueComponent],
      imports: [FormsModule]
    })
      .compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemsWithBonusTypeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('splits sets into reachable and out-of-reach by piece threshold', () => {
    component.affixName = 'Kinetic Lore';
    component.bonusType = 'Artifact';
    vi.spyOn(component.gearDB, 'findGearWithAffixAndType').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'findAugmentsWithAffixAndType').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'findSetsWithAffixAndType').mockReturnValue([
      ['Reachable Set', 2, 5],
      ['Out Of Reach Set', 3, 6],
    ] as any);
    vi.spyOn(component.equipped, 'getCompatibleGear').mockReturnValue([]);
    vi.spyOn(component.equipped, 'getUnlockedSlots').mockReturnValue(new Set(['Cloak', 'Boots']));
    vi.spyOn(component.equipped, 'getActiveSets').mockReturnValue(new Map());
    vi.spyOn((component as any).availability, 'isSetReachable').mockImplementation((setName: any) => setName === 'Reachable Set');

    (component as any).refreshMatches();

    expect(component.sets.map(entry => entry[0])).toEqual(['Reachable Set']);
    expect(component.unreachableSets.map(entry => entry[0])).toEqual(['Out Of Reach Set']);
  });

  it('lists items for an already-filled slot apart from the ones that could be equipped', () => {
    const makeItem = (name: string, slot: string) => new Item({
      name, slot, type: 'Test', ml: 1, affixes: [{ name: 'Kinetic Lore', type: 'Artifact', value: 5 }],
      sets: [], url: '/page/' + name.replace(/ /g, '_'), crafting: [], quests: [], artifact: false,
    });
    const worn = makeItem('Worn Boots', 'Boots');
    const otherBoots = makeItem('Other Boots', 'Boots');
    const gloves = makeItem('Some Gloves', 'Gloves');
    component.affixName = 'Kinetic Lore';
    component.bonusType = 'Artifact';
    component.equipped.set(worn);
    vi.spyOn(component.gearDB, 'findGearWithAffixAndType').mockReturnValue([otherBoots, gloves]);
    vi.spyOn(component.gearDB, 'findAugmentsWithAffixAndType').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'findSetsWithAffixAndType').mockReturnValue([] as any);

    fixture.detectChanges();
    (component as any).refreshMatches();
    fixture.detectChanges();

    expect(component.matches.map(item => item.name)).toEqual(['Some Gloves']);
    expect(component.lockedMatches.map(item => item.name)).toEqual(['Other Boots']);
    expect(fixture.nativeElement.textContent).toContain('Excluded by equipment');
  });

  it('lists a Minor Artifact under the equipment exclusions once another one is worn', () => {
    const makeArtifact = (name: string, slot: string) => new Item({
      name, slot, type: 'Test', ml: 30, affixes: [{ name: 'Kinetic Lore', type: 'Artifact', value: 5 }],
      sets: [], url: '/page/' + name.replace(/ /g, '_'), crafting: [], quests: [], artifact: true,
    });
    const boots = makeArtifact('Artifact Boots', 'Boots');
    component.affixName = 'Kinetic Lore';
    component.bonusType = 'Artifact';
    component.equipped.set(makeArtifact('Artifact Ring', 'Ring1'));
    vi.spyOn(component.gearDB, 'findGearWithAffixAndType').mockReturnValue([boots]);
    vi.spyOn(component.gearDB, 'findAugmentsWithAffixAndType').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'findSetsWithAffixAndType').mockReturnValue([] as any);

    fixture.detectChanges();
    (component as any).refreshMatches();
    fixture.detectChanges();

    expect(component.matches).toEqual([]);
    expect(component.lockedMatches.map(item => item.name)).toEqual(['Artifact Boots']);
    expect(fixture.nativeElement.textContent).toContain('Only one Minor Artifact');
  });

  describe('drawer header and non-gear panel', () => {
    function open(affixName: string, bonusType: string) {
      component.affixName = affixName;
      component.bonusType = bonusType;
      vi.spyOn(component.gearDB, 'findGearWithAffixAndType').mockReturnValue([]);
      vi.spyOn(component.gearDB, 'findAugmentsWithAffixAndType').mockReturnValue([]);
      vi.spyOn(component.gearDB, 'findSetsWithAffixAndType').mockReturnValue([] as any);
      fixture.detectChanges();
      (component as any).refreshMatches();
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('titles an ordinary affix with its bonus type and offers non-gear sources', () => {
      const el = open('Kinetic Lore', 'Artifact');

      expect(el.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Kinetic Lore: Artifact');
      expect(el.querySelector('.external-affix-panel')).not.toBeNull();
    });

    it('titles a count affix by name alone and offers no non-gear sources', () => {
      const el = open('Max Filigree Slots', 'Untyped');

      expect(el.querySelector('h2')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Max Filigree Slots');
      expect(el.querySelector('.external-affix-panel')).toBeNull();
    });

    describe('non-gear form', () => {
      function buttonNamed(el: HTMLElement, text: string) {
        return Array.from(el.querySelectorAll<HTMLButtonElement>('.external-affix-form button'))
          .find(button => button.textContent!.trim() === text)!;
      }

      async function type(input: HTMLInputElement, text: string) {
        input.value = text;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      }

      async function check(input: HTMLInputElement) {
        input.click();
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.detectChanges();
      }

      it('needs a source and a value before Add is enabled', async () => {
        const el = open('Kinetic Lore', 'Artifact');
        expect(buttonNamed(el, 'Add').disabled).toBe(true);

        await type(el.querySelector('.external-affix-label-input')!, 'Trance');
        expect(buttonNamed(el, 'Add').disabled).toBe(true);

        await type(el.querySelector('.external-affix-value-input')!, '5');
        expect(buttonNamed(el, 'Add').disabled).toBe(false);
      });

      it('adds the value under the trimmed source, then lists it in place of the form', async () => {
        const el = open('Kinetic Lore', 'Artifact');
        await type(el.querySelector('.external-affix-label-input')!, '  Trance ');
        await type(el.querySelector('.external-affix-value-input')!, '5');

        buttonNamed(el, 'Add').click();
        fixture.detectChanges();

        expect(component.equipped.getExternalAffixesForType('Kinetic Lore', 'Artifact'))
          .toEqual([expect.objectContaining({ kind: 'value', value: 5, label: 'Trance' })]);
        expect(el.querySelector('.external-affix-form')).toBeNull();
        expect(el.querySelector('.external-affix-entry-row')?.textContent).toContain('+5 Artifact (Trance)');
      });

      it('offers a Covered checkbox instead of a value for a checklist type', async () => {
        const el = open('Feather Falling', 'Bool');
        expect(el.querySelector('.external-affix-value-input')).toBeNull();

        await type(el.querySelector('.external-affix-label-input')!, 'Ring');
        expect(buttonNamed(el, 'Add').disabled).toBe(true);

        await check(el.querySelector('.external-affix-checkbox-label input')!);
        buttonNamed(el, 'Add').click();

        expect(component.equipped.getExternalAffixesForType('Feather Falling', 'Bool'))
          .toEqual([expect.objectContaining({ kind: 'value', value: 1, label: 'Ring' })]);
      });

      it('ignores the type without a source, labelling it Ignored', () => {
        const el = open('Kinetic Lore', 'Artifact');

        buttonNamed(el, 'Ignore').click();
        fixture.detectChanges();

        expect(component.equipped.getExternalAffixesForType('Kinetic Lore', 'Artifact'))
          .toEqual([expect.objectContaining({ kind: 'ignored', label: 'Ignored' })]);
      });

      it('cannot ignore once a value has been started', async () => {
        const el = open('Kinetic Lore', 'Artifact');
        await type(el.querySelector('.external-affix-value-input')!, '5');

        expect(buttonNamed(el, 'Ignore').disabled).toBe(true);
      });
    });
  });

  it('reports how many pieces of a set are already equipped', () => {
    component.affixName = 'Kinetic Lore';
    component.bonusType = 'Artifact';
    vi.spyOn(component.gearDB, 'findGearWithAffixAndType').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'findAugmentsWithAffixAndType').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'findSetsWithAffixAndType').mockReturnValue([['Owned Set', 3, 6]] as any);
    vi.spyOn(component.equipped, 'getCompatibleGear').mockReturnValue([]);
    vi.spyOn(component.equipped, 'getUnlockedSlots').mockReturnValue(new Set(['Cloak', 'Boots', 'Gloves']));
    vi.spyOn(component.equipped, 'getActiveSets').mockReturnValue(new Map([['Owned Set', 2]]));
    vi.spyOn((component as any).availability, 'isSetReachable').mockReturnValue(true);

    (component as any).refreshMatches();

    expect(component.equippedPiecesForSet('Owned Set')).toBe(2);
    expect(component.equippedPiecesForSet('Some Other Set')).toBe(0);
  });

  it('offers free non-augment crafting tiers on equipped items', () => {
    component.affixName = 'Disable Device';
    component.bonusType = 'Insight';

    const filledTier = new Craftable('T1 (Equipment)', [
      new CraftableOption({ affixes: [{ name: 'Disable Device', type: 'Competence', value: 22 }] }),
    ]);
    filledTier.selected = filledTier.options[1];
    const openTier = new Craftable('T2 (Equipment)', [
      new CraftableOption({ affixes: [{ name: 'Disable Device', type: 'Insight', value: 7 }] }),
    ]);

    const necklace = new Item(null);
    necklace.name = 'Legendary Green Steel Necklace';
    necklace.slot = 'Neck';
    necklace.crafting = [filledTier, openTier];

    vi.spyOn(component.gearDB, 'findGearWithAffixAndType').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'findAugmentsWithAffixAndType').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'findSetsWithAffixAndType').mockReturnValue([] as any);
    vi.spyOn(component.equipped, 'getCompatibleGear').mockReturnValue([]);
    vi.spyOn(component.equipped, 'getUnlockedSlots').mockReturnValue(new Set());
    vi.spyOn(component.equipped, 'getActiveSets').mockReturnValue(new Map());
    vi.spyOn(component.equipped, 'getSlotsSnapshot').mockReturnValue(new Map([['Neck', necklace]]));

    (component as any).refreshMatches();

    const keys = Array.from(component.craftIntoEquippedGear.keys());
    expect(keys.length).toBe(1);
    const gearMap = component.craftIntoEquippedGear.get(keys[0])!;
    const [equippedItem] = Array.from(gearMap.keys());
    expect(equippedItem.name).toBe('Legendary Green Steel Necklace');
    expect(gearMap.get(equippedItem)!.map(c => c.name)).toEqual(['T2 (Equipment)']);
    expect(component.craftOptionMatchValue(keys[0])).toBe(7);
  });
});

// Drives the item-preview carousel through the rendered DOM, so these tests
// pin behaviour independent of how the preview is implemented.
describe('ItemsWithBonusTypeComponent item preview', () => {
  let component: ItemsWithBonusTypeComponent;
  let fixture: ComponentFixture<ItemsWithBonusTypeComponent>;
  let el: HTMLElement;

  function makeItem(name: string, slot: string, value: number): Item {
    return new Item({
      name,
      slot,
      type: 'Test',
      ml: 1,
      affixes: [{ name: 'Kinetic Lore', type: 'Artifact', value }],
      sets: [],
      url: '/page/' + name.replace(/ /g, '_'),
      crafting: [],
      quests: [],
      artifact: false,
    });
  }

  function render(items: Item[]) {
    component.affixName = 'Kinetic Lore';
    component.bonusType = 'Artifact';
    vi.spyOn(component.gearDB, 'findGearWithAffixAndType').mockReturnValue(items);
    vi.spyOn(component.gearDB, 'findAugmentsWithAffixAndType').mockReturnValue([]);
    vi.spyOn(component.gearDB, 'findSetsWithAffixAndType').mockReturnValue([]);
    vi.spyOn(component.equipped, 'getCompatibleGear').mockImplementation(gear => gear);
    vi.spyOn(component.equipped, 'getUnlockedSlots').mockReturnValue(new Set(items.map(item => item.slot)));
    fixture.detectChanges();
  }

  const rowLinks = () => Array.from(el.querySelectorAll<HTMLElement>('.item-preview-link'));
  const panel = () => el.querySelector<HTMLElement>('.item-preview-panel');
  const panelTitle = () => panel()?.querySelector('h3')?.textContent?.trim();
  const button = (label: string) => el.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  const selectedRows = () => Array.from(el.querySelectorAll('.selected-preview-row'));

  function click(target: HTMLElement) {
    target.click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(ItemsWithBonusTypeComponent);
    component = fixture.componentInstance;
    el = fixture.nativeElement;
  });

  it('opens on the clicked row and highlights it', () => {
    render([makeItem('Alpha', 'Neck', 3), makeItem('Beta', 'Belt', 2), makeItem('Gamma', 'Boots', 1)]);
    expect(panel()).toBeNull();

    click(rowLinks()[1]);

    expect(panelTitle()).toBe('Beta');
    expect(selectedRows().length).toBe(1);
    expect(selectedRows()[0].textContent).toContain('Beta');
  });

  it('steps through the rendered list and clamps at both ends', () => {
    render([makeItem('Alpha', 'Neck', 3), makeItem('Beta', 'Belt', 2), makeItem('Gamma', 'Boots', 1)]);

    click(rowLinks()[0]);
    expect(button('Previous item').disabled).toBe(true);
    expect(button('Next item').disabled).toBe(false);

    click(button('Next item'));
    expect(panelTitle()).toBe('Beta');
    click(button('Next item'));
    expect(panelTitle()).toBe('Gamma');
    expect(button('Next item').disabled).toBe(true);

    click(button('Next item'));
    expect(panelTitle()).toBe('Gamma');

    click(button('Previous item'));
    expect(panelTitle()).toBe('Beta');
    expect(selectedRows()[0].textContent).toContain('Beta');
  });

  it('only carries the carousel across the 100 rows it renders', () => {
    const items = Array.from({ length: 101 }, (_, i) => makeItem('Item ' + (101 - i), 'Neck', 101 - i));
    render(items);
    expect(rowLinks().length).toBe(100);

    click(rowLinks()[99]);

    expect(panelTitle()).toBe('Item 2');
    expect(button('Next item').disabled).toBe(true);
  });

  it('equips the previewed item and closes the drawer', () => {
    render([makeItem('Alpha', 'Neck', 3), makeItem('Beta', 'Belt', 2)]);
    const set = vi.spyOn(component.equipped, 'set').mockReturnValue(undefined);
    const close = vi.spyOn(TestBed.inject(SuggestionDrawerService), 'close').mockReturnValue(undefined);

    click(rowLinks()[0]);
    click(button('Next item'));
    click(el.querySelector<HTMLElement>('.preview-equip-button')!);

    expect(set).toHaveBeenCalledTimes(1);
    expect(vi.mocked(set).mock.lastCall![0].name).toBe('Beta');
    expect(close).toHaveBeenCalled();
  });

  it('closes without equipping and clears the row highlight', () => {
    render([makeItem('Alpha', 'Neck', 3)]);
    const set = vi.spyOn(component.equipped, 'set').mockReturnValue(undefined);

    click(rowLinks()[0]);
    click(button('Close item preview'));

    expect(panel()).toBeNull();
    expect(selectedRows().length).toBe(0);
    expect(set).not.toHaveBeenCalled();
  });
});
