import { ApplicationRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { FiligreeSlotsComponent } from './filigree-slots.component';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { Item } from '../gear/item';
import { MAX_FILIGREE_SLOTS_AFFIX } from '../affixes/filigree-affix';

const weapon = () => new Item({ name: 'Test Longsword', slot: 'Weapon', type: 'Longswords', ml: 30, affixes: [], crafting: [], quests: [] });
const artifact = (slots: number) => new Item({
  name: 'Test Artifact', slot: 'Trinket', type: 'Trinkets', ml: 30, crafting: [], quests: [], artifact: true,
  affixes: [{ name: MAX_FILIGREE_SLOTS_AFFIX, type: 'Untyped', value: slots }],
});

describe('FiligreeSlotsComponent', () => {
  let fixture: ComponentFixture<FiligreeSlotsComponent>;
  let equipped: EquippedService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    equipped = TestBed.inject(EquippedService);
    TestBed.inject(FiltersService).setLevelRange(1, 34);
  });

  function render(host: 'weapon' | 'artifact'): HTMLElement {
    fixture = TestBed.createComponent(FiligreeSlotsComponent);
    fixture.componentRef.setInput('host', host);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  function expand(element: HTMLElement) {
    if (element.querySelector('.filigree-slots-toggle')!.getAttribute('aria-expanded') !== 'true') {
      element.querySelector<HTMLButtonElement>('.filigree-slots-toggle')!.click();
      fixture.detectChanges();
    }
  }

  const rowTexts = (element: HTMLElement) => Array.from(element.querySelectorAll('.filigree-slot-row'))
    .map(row => Array.from(row.querySelectorAll('.filigree-slot-number, .filigree-slot-name, .filigree-slot-affixes, .filigree-slot-note, .filigree-slot-empty'))
      .map(part => part.textContent!.trim()).join(' | '));

  it('shows nothing without a weapon to hold the filigree', () => {
    expect(render('weapon').querySelector('.filigree-slots')).toBeNull();
  });

  it('shows nothing below level 20 when nothing is slotted', () => {
    equipped.set(weapon());
    TestBed.inject(FiltersService).setLevelRange(1, 19);

    expect(render('weapon').querySelector('.filigree-slots')).toBeNull();
  });

  it('collapses to a count of slotted over open slots', () => {
    equipped.set(weapon());
    equipped.setFiligree('weapon', 0, { name: 'Celerity: Dexterity', rare: false });
    equipped.setFiligreeSlotSetting('weapon', 7);

    const element = render('weapon');

    expect(element.querySelector('.filigree-slots-count')!.textContent).toBe('1/7');
    expect(element.querySelector('.filigree-slot-row')).toBeNull();
  });

  it('lists every open slot, with what each filigree gives', () => {
    equipped.set(weapon());
    equipped.setFiligree('weapon', 0, { name: 'Celerity: Dexterity', rare: true });
    equipped.setFiligreeSlotSetting('weapon', 3);

    const element = render('weapon');
    expand(element);

    expect(rowTexts(element)).toEqual([
      '1 | Celerity: Dexterity (Rare) | Dexterity +1, Physical Sheltering +2',
      '2 | Empty slot',
      '3 | Empty slot',
    ]);
  });

  it('strikes through a duplicate\'s bonuses but not its name', () => {
    equipped.set(weapon());
    equipped.setFiligree('weapon', 0, { name: 'Celerity: Reflex', rare: false });
    equipped.setFiligree('weapon', 1, { name: 'Celerity: Reflex', rare: false });

    const element = render('weapon');
    expand(element);
    const rows = element.querySelectorAll('.filigree-slot-row');

    expect(rows[0].querySelector('.filigree-struck')).toBeNull();
    expect(rows[1].querySelector('.filigree-slot-affixes')!.classList).toContain('filigree-struck');
    expect(rows[1].querySelector('.filigree-slot-name')!.classList).not.toContain('filigree-struck');
    expect(rows[1].textContent).toContain('Duplicate: set piece only');
  });

  it('keeps a filigree past the open slots, marked as not counting', () => {
    equipped.set(artifact(2));
    equipped.setFiligree('artifact', 2, { name: 'Celerity: Reflex', rare: false });

    const element = render('artifact');
    expand(element);

    expect(rowTexts(element)[2]).toContain('Slot not open');
    expect(element.querySelector('.filigree-slots-count')!.textContent).toBe('0/2');
  });

  it('opens and closes slots with the stepper, within what the artifact holds', () => {
    equipped.set(artifact(3));
    const element = render('artifact');
    expand(element);
    const [fewer, more] = Array.from(element.querySelectorAll<HTMLButtonElement>('.filigree-slots-step'));

    expect(more.disabled).toBe(true);
    fewer.click();
    fixture.detectChanges();

    expect(equipped.getOpenFiligreeSlots('artifact')).toBe(2);
    expect(element.querySelectorAll('.filigree-slot-row').length).toBe(2);
  });

  it('marks a filigree rare, and removes one', () => {
    equipped.set(weapon());
    equipped.setFiligree('weapon', 0, { name: 'Celerity: Dexterity', rare: false });
    const element = render('weapon');
    expand(element);

    element.querySelector<HTMLInputElement>('.filigree-slot-rare input')!.click();
    expect(equipped.getFiligreeLoadout().weapon[0]).toEqual({ name: 'Celerity: Dexterity', rare: true });

    element.querySelector<HTMLButtonElement>('.filigree-slot-clear')!.click();
    expect(equipped.getFiligreeLoadout().weapon[0]).toBeNull();
  });

  it('opens the picker for a slot and puts the chosen filigree in it', async () => {
    equipped.set(weapon());
    equipped.setImportantAffixes(['Reflex Save']);
    const element = render('weapon');
    expand(element);

    element.querySelectorAll<HTMLButtonElement>('.filigree-slot-pick')[2].click();
    // The picker is loaded on first use.
    for (let tries = 0; tries < 50 && !element.querySelector('.filigree-picker'); tries++) {
      await TestBed.inject(ApplicationRef).whenStable();
      await new Promise(resolve => setTimeout(resolve, 20));
      fixture.detectChanges();
    }

    const search = element.querySelector<HTMLInputElement>('.filigree-picker-search')!;
    search.value = 'celerity: reflex';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector<HTMLButtonElement>('.filigree-picker-entry')!.click();
    fixture.detectChanges();

    expect(equipped.getFiligreeLoadout().weapon[2]).toEqual({ name: 'Celerity: Reflex', rare: false });
    expect(element.querySelector('.filigree-picker')).toBeNull();
  });
});
