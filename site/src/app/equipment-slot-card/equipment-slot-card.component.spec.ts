import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EquipmentSlotCardComponent } from './equipment-slot-card.component';
import { EquippedService } from '../planner/equipped.service';
import { GearDbService } from '../gear/gear-db.service';
import { By } from '@angular/platform-browser';
import { CraftingOptionPickerComponent } from '../crafting-option-picker/crafting-option-picker.component';

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

  describe('Mythic, Reaper and Curse bonuses', () => {
    let equipped: EquippedService;

    beforeEach(() => {
      equipped = TestBed.inject(EquippedService);
    });

    function equip(slot: string): HTMLElement {
      equipped.set(TestBed.inject(GearDbService).getGearBySlot(slot)[0]);
      return render(slot);
    }

    function openEditor(card: HTMLElement) {
      bonusButton(card)!.click();
      fixture.detectChanges();
    }

    const bonusButton = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('.slot-bonus-button');
    const bonusRows = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLElement>('.item-bonus-row'));
    const rowLabels = (card: HTMLElement) => bonusRows(card).map(row => row.querySelector('.col')!.textContent!.trim());
    const optionClass = (row: HTMLElement, name: string) => Array.from(row.querySelectorAll('option'))
      .find(option => option.textContent!.trim() === name)!.className;

    function choose(row: HTMLElement, optionName: string) {
      const select = row.querySelector('select')!;
      select.selectedIndex = Array.from(select.options).findIndex(option => option.textContent!.trim() === optionName);
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    function chooseCurse(card: HTMLElement, name: string) {
      const picker = fixture.debugElement.query(By.directive(CraftingOptionPickerComponent)).componentInstance as CraftingOptionPickerComponent;
      picker.selectedChange.emit(picker.options.find(option => option.name === name));
      fixture.detectChanges();
    }

    it('has no button for an empty slot or a quiver', () => {
      expect(bonusButton(render('Helm'))).toBeNull();
      expect(bonusButton(equip('Quiver'))).toBeNull();
    });

    it('shows no rows until the button opens them, then one per kind', () => {
      const card = equip('Helm');
      expect(bonusRows(card)).toEqual([]);

      openEditor(card);

      expect(rowLabels(card)).toEqual(['Mythic', 'Reaper', 'Curse']);
      expect(bonusButton(card)!.getAttribute('aria-pressed')).toBe('true');
    });

    it('colours each option by what it would do for the tracked affixes, as a crafting list does', () => {
      equipped.setImportantAffixes(['Physical Sheltering']);
      const card = equip('Helm');
      openEditor(card);
      const [mythic, reaper] = bonusRows(card);

      expect(optionClass(mythic, 'Mythic +3 (PRR/MRR)')).toBe('BetterThanBest');
      expect(optionClass(mythic, 'None')).toBe('Irrelevant');
      expect(optionClass(reaper, 'Reaper Enchantment: Physical Resistance Rating')).toBe('BetterThanBest');
      expect(optionClass(reaper, 'Reaper Enchantment: Power')).toBe('Irrelevant');
    });

    it('ranks an option against the bonus it would replace', () => {
      equipped.setImportantAffixes(['Physical Sheltering']);
      const card = equip('Helm');
      openEditor(card);
      choose(bonusRows(card)[0], 'Mythic +3 (PRR/MRR)');

      expect(optionClass(bonusRows(card)[0], 'Mythic +3 (PRR/MRR)')).toBe('Best');
      expect(optionClass(bonusRows(card)[0], 'Mythic +1 (PRR/MRR)')).toBe('Outranked');
    });

    it('picks a curse from the searchable list long crafting lists use', () => {
      const card = equip('Helm');
      openEditor(card);

      expect(bonusRows(card)[2].querySelector('app-crafting-option-picker')).not.toBeNull();

      chooseCurse(card, 'Curse of Major Strength');

      expect(equipped.getSlotsSnapshot().get('Helm')?.bonuses.curse?.name).toBe('Curse of Major Strength');
    });

    it('keeps only the chosen rows once closed', () => {
      const card = equip('Helm');
      openEditor(card);
      choose(bonusRows(card)[1], 'Reaper Helmet Enchantment');

      openEditor(card);

      expect(rowLabels(card)).toEqual(['Reaper']);
      expect(bonusButton(card)!.classList).toContain('is-active');
    });

    it('takes a bonus off again with None', () => {
      const card = equip('Helm');
      openEditor(card);
      choose(bonusRows(card)[0], 'Mythic +3 (PRR/MRR)');

      choose(bonusRows(card)[0], 'None');

      expect(equipped.getSlotsSnapshot().get('Helm')?.bonuses).toEqual({});
    });
  });
});
