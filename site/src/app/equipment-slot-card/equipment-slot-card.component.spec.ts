import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EquipmentSlotCardComponent } from './equipment-slot-card.component';
import { EquippedService } from '../planner/equipped.service';
import { GearDbService } from '../gear/gear-db.service';

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

    const bonusButton = (card: HTMLElement) => card.querySelector<HTMLButtonElement>('.slot-bonus-button');
    const bonusRows = (card: HTMLElement) => Array.from(card.querySelectorAll<HTMLElement>('.item-bonus-row'));
    const rowLabels = (card: HTMLElement) => bonusRows(card).map(row => row.querySelector('.col')!.textContent!.trim());

    function choose(row: HTMLElement, optionName: string) {
      const select = row.querySelector('select')!;
      const index = Array.from(select.options).findIndex(option => option.textContent!.trim() === optionName);
      select.selectedIndex = index;
      select.dispatchEvent(new Event('change'));
      fixture.detectChanges();
    }

    it('has no button for an empty slot or a quiver', () => {
      expect(bonusButton(render('Helm'))).toBeNull();
      expect(bonusButton(equip('Quiver'))).toBeNull();
    });

    it('shows no rows until the button opens them, then one per kind', () => {
      const card = equip('Helm');
      expect(bonusRows(card)).toEqual([]);

      bonusButton(card)!.click();
      fixture.detectChanges();

      expect(rowLabels(card)).toEqual(['Mythic', 'Reaper', 'Curse']);
      expect(bonusButton(card)!.getAttribute('aria-pressed')).toBe('true');
    });

    it('puts a chosen bonus on the equipped item and keeps only its row once closed', () => {
      const card = equip('Helm');
      bonusButton(card)!.click();
      fixture.detectChanges();

      choose(bonusRows(card)[2], 'Curse of Major Strength');

      expect(equipped.getSlotsSnapshot().get('Helm')?.bonuses.curse?.name).toBe('Curse of Major Strength');

      bonusButton(card)!.click();
      fixture.detectChanges();

      expect(rowLabels(card)).toEqual(['Curse']);
      expect(bonusButton(card)!.classList).toContain('is-active');
    });

    it('takes a bonus off again with None', () => {
      const card = equip('Helm');
      bonusButton(card)!.click();
      fixture.detectChanges();
      choose(bonusRows(card)[0], 'Mythic +3 (PRR/MRR)');

      choose(bonusRows(card)[0], 'None');

      expect(equipped.getSlotsSnapshot().get('Helm')?.bonuses).toEqual({});
    });
  });
});
