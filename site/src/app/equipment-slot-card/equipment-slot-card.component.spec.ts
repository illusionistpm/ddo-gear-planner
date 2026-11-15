import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EquipmentSlotCardComponent } from './equipment-slot-card.component';
import { EquippedService } from '../planner/equipped.service';
import { GearDbService } from '../gear/gear-db.service';
import { By } from '@angular/platform-browser';
import { CraftingOptionPickerComponent } from '../crafting-option-picker/crafting-option-picker.component';
import { ItemBonusKind } from '../gear/item-bonus';
import { ItemBonusService } from '../gear/item-bonus.service';
import { ItemBonusSettingsService } from '../planner/item-bonus-settings.service';

describe('EquipmentSlotCardComponent', () => {
  let fixture: ComponentFixture<EquipmentSlotCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    fixture = TestBed.createComponent(EquipmentSlotCardComponent);
  });

  function render(slot: string): HTMLElement {
    fixture.componentRef.setInput('slot', slot);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('shows the slot\'s icon before its name', () => {
    const name = render('Helm').querySelector('.slot-name')!;

    expect(name.querySelector('app-slot-icon svg path')?.getAttribute('d')).toBeTruthy();
    expect(name.querySelector('.slot-name-text')!.textContent).toBe('Helm');
  });

  it('spaces out a numbered slot\'s name', () => {
    const name = render('Ring1').querySelector('.slot-name-text')!;

    expect(name.textContent).toBe('Ring 1');
  });

  it('names an equipped weapon\'s kind after the slot name', () => {
    const equipped = TestBed.inject(EquippedService);
    const weapon = TestBed.inject(GearDbService).getGearBySlot('Weapon').find(item => item.type === 'Long Swords')!;
    equipped.set(weapon);

    expect(render('Weapon').querySelector('.slot-name-text')!.textContent).toBe('Weapon – Long Sword');
  });

  it('names no kind for an empty weapon slot', () => {
    expect(render('Weapon').querySelector('.slot-name-text')!.textContent).toBe('Weapon');
  });

  it('marks the offhand occupied while a two-handed weapon is equipped', () => {
    const equipped = TestBed.inject(EquippedService);
    const twoHander = TestBed.inject(GearDbService).getGearBySlot('Weapon').find(item => item.hasTypeAttribute('two-handed'))!;
    equipped.set(twoHander);

    expect(render('Offhand').querySelector('.slot-name-text')!.textContent).toBe('Offhand – Occupied');
  });

  describe('Mythic, Reaper and Curse bonuses', () => {
    let equipped: EquippedService;
    let settings: ItemBonusSettingsService;

    beforeEach(() => {
      equipped = TestBed.inject(EquippedService);
      settings = TestBed.inject(ItemBonusSettingsService);
    });

    function equip(slot: string): HTMLElement {
      equipped.set(TestBed.inject(GearDbService).getGearBySlot(slot)[0]);
      return render(slot);
    }

    function switchOn(...kinds: ItemBonusKind[]) {
      kinds.forEach(kind => settings.setEnabled(kind, true));
      fixture.detectChanges();
    }

    const bonusRows = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLElement>('.item-bonus-row'));
    const rowLabels = (card: HTMLElement) => bonusRows(card).map(row => row.querySelector('.col')!.textContent!.trim());
    /** The crafting picker in a bonus row. */
    function pickerIn(row: HTMLElement): CraftingOptionPickerComponent {
      const picker = fixture.debugElement.queryAll(By.directive(CraftingOptionPickerComponent))
        .find(debug => row.contains(debug.nativeElement));
      expect(picker).toBeTruthy();
      return picker!.componentInstance as CraftingOptionPickerComponent;
    }

    /** The rank class an option gets in its row's list, opened as a player would. */
    function optionClass(row: HTMLElement, name: string): string {
      const picker = pickerIn(row);
      picker.onOpenChange(true);
      const tier = picker.families.flatMap(family => family.tiers).find(t => t.option.describe() === name);
      picker.onOpenChange(false);
      expect(tier).toBeTruthy();
      return tier!.className;
    }

    function choose(row: HTMLElement, optionName: string) {
      const picker = pickerIn(row);
      picker.selectedChange.emit(picker.options.find(option => option.describe() === optionName));
      fixture.detectChanges();
    }

    it('shows nothing of them to a player who hasn\'t switched a system on', () => {
      const card = equip('Helm');

      expect(bonusRows(card)).toEqual([]);
      expect(card.textContent).not.toMatch(/Mythic|Reaper|Curse/);
    });

    it('shows a row for each system switched on, and only those', () => {
      const card = equip('Helm');

      switchOn('reaper');
      expect(rowLabels(card)).toEqual(['Reaper']);

      switchOn('mythic', 'curse');
      expect(rowLabels(card)).toEqual(['Mythic', 'Reaper', 'Curse']);

      settings.setEnabled('reaper', false);
      fixture.detectChanges();
      expect(rowLabels(card)).toEqual(['Mythic', 'Curse']);
    });

    it('has no rows for an empty slot or a quiver', () => {
      const empty = render('Helm');
      switchOn('mythic', 'reaper', 'curse');

      expect(bonusRows(empty)).toEqual([]);
      expect(bonusRows(equip('Quiver'))).toEqual([]);
    });

    it('still shows a bonus the item carries when its system is off, as a shared build\'s does', () => {
      const card = equip('Helm');
      equipped.setItemBonus('Helm', 'reaper', TestBed.inject(ItemBonusService).find('reaper', 'Helm', 'Reaper Helmet Enchantment'));
      fixture.detectChanges();

      expect(rowLabels(card)).toEqual(['Reaper']);

      choose(bonusRows(card)[0], '');

      expect(bonusRows(card)).toEqual([]);
    });

    it('colours each option by what it would do for the tracked affixes, as a crafting list does', () => {
      equipped.setImportantAffixes(['Physical Sheltering']);
      const card = equip('Helm');
      switchOn('mythic', 'reaper');
      const [mythic, reaper] = bonusRows(card);

      expect(optionClass(mythic, 'Mythic +3 (PRR/MRR)')).toBe('BetterThanBest');
      expect(optionClass(mythic, '')).toBe('Irrelevant');
      expect(optionClass(reaper, 'Reaper Enchantment: PRR')).toBe('BetterThanBest');
      expect(optionClass(reaper, 'Reaper Enchantment: Power')).toBe('Irrelevant');
    });

    it('ranks an option against the bonus it would replace', () => {
      equipped.setImportantAffixes(['Physical Sheltering']);
      const card = equip('Helm');
      switchOn('mythic');
      choose(bonusRows(card)[0], 'Mythic +3 (PRR/MRR)');

      expect(optionClass(bonusRows(card)[0], 'Mythic +3 (PRR/MRR)')).toBe('Best');
      expect(optionClass(bonusRows(card)[0], 'Mythic +1 (PRR/MRR)')).toBe('Outranked');
    });

    it('picks every bonus from the crafting picker, whose entries wrap', () => {
      const card = equip('Helm');
      switchOn('mythic', 'reaper', 'curse');

      expect(bonusRows(card).map(row => !!row.querySelector('app-crafting-option-picker'))).toEqual([true, true, true]);
      expect(card.querySelector('.item-bonus-row select')).toBeNull();
      // Mythic's and Reaper's few options are listed outright; the curses keep search.
      expect(bonusRows(card).map(row => pickerIn(row).compact)).toEqual([true, true, false]);
      // Nothing chosen reads as blank, as an empty crafting slot does.
      expect(bonusRows(card).map(row => row.querySelector('.crafting-picker-toggle-label')!.textContent!.trim())).toEqual(['', '', '']);

      choose(bonusRows(card)[2], 'Curse of Major Strength');

      expect(equipped.getSlotsSnapshot().get('Helm')?.bonuses.curse?.name).toBe('Curse of Major Strength');
    });

    it('takes a bonus off again with None, keeping the row while its system is on', () => {
      const card = equip('Helm');
      switchOn('mythic');
      choose(bonusRows(card)[0], 'Mythic +3 (PRR/MRR)');

      choose(bonusRows(card)[0], '');

      expect(equipped.getSlotsSnapshot().get('Helm')?.bonuses).toEqual({});
      expect(rowLabels(card)).toEqual(['Mythic']);
    });
  });
});
