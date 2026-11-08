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

  it('collapses to a count of slotted over what the item holds', () => {
    equipped.set(weapon());
    equipped.setFiligree('weapon', 0, { name: 'Celerity: Dexterity', rare: false });

    const element = render('weapon');

    expect(element.querySelector('.filigree-slots-count')!.textContent).toBe('1/10');
    expect(element.querySelector('.filigree-slot-row')).toBeNull();
  });

  it('lists the filigrees, with what each gives, and one empty slot after them', () => {
    equipped.set(weapon());
    equipped.setFiligree('weapon', 0, { name: 'Celerity: Dexterity', rare: true });

    const element = render('weapon');
    expand(element);

    // The checked Rare box marks the rare copy; the name doesn't repeat it.
    expect(element.querySelector<HTMLInputElement>('.filigree-slot-rare input')!.checked).toBe(true);
    expect(rowTexts(element)).toEqual([
      '1 | Celerity: Dexterity | Dexterity +1, Physical Sheltering +2',
      '2 | Empty slot',
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

  it('has no empty slot once the item is full, and hides filigree past what it holds', () => {
    equipped.set(artifact(3));
    ['Celerity: Dexterity', 'Celerity: Reflex', 'Zephyr: Tumble'].forEach((name, index) =>
      equipped.setFiligree('artifact', index, { name, rare: false }));
    equipped.set(artifact(2));

    const element = render('artifact');
    expand(element);

    expect(rowTexts(element)).toEqual([
      '1 | Celerity: Dexterity | Dexterity +1',
      '2 | Celerity: Reflex | Reflex Save +2',
    ]);
    expect(element.querySelector('.filigree-slots-count')!.textContent).toBe('2/2');
    expect(element.querySelector('.filigree-slots-step')).toBeNull();
  });

  it('slides the rest up when one is removed from the middle', () => {
    equipped.set(weapon());
    ['Celerity: Dexterity', 'Celerity: Reflex', 'Zephyr: Tumble'].forEach((name, index) =>
      equipped.setFiligree('weapon', index, { name, rare: false }));
    const element = render('weapon');
    expand(element);

    element.querySelectorAll<HTMLButtonElement>('.filigree-slot-clear')[1].click();
    fixture.detectChanges();

    expect(rowTexts(element).map(text => text.split(' | ').slice(0, 2).join(' | '))).toEqual([
      '1 | Celerity: Dexterity', '2 | Zephyr: Tumble', '3 | Empty slot',
    ]);
  });

  it('marks a filigree rare, and removes one', () => {
    equipped.set(weapon());
    equipped.setFiligree('weapon', 0, { name: 'Celerity: Dexterity', rare: false });
    const element = render('weapon');
    expand(element);

    element.querySelector<HTMLInputElement>('.filigree-slot-rare input')!.click();
    expect(equipped.getFiligreeLoadout().weapon[0]).toEqual({ name: 'Celerity: Dexterity', rare: true });

    element.querySelector<HTMLButtonElement>('.filigree-slot-clear')!.click();
    expect(equipped.getFiligreeLoadout().weapon).toEqual([]);
  });

  it('opens the picker for a slot and puts the chosen filigree in it', async () => {
    equipped.set(weapon());
    equipped.setImportantAffixes(['Reflex Save']);
    const element = render('weapon');
    expand(element);

    // The one row is the empty slot.
    element.querySelectorAll<HTMLButtonElement>('.filigree-slot-pick')[0].click();
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

    expect(equipped.getFiligreeLoadout().weapon).toEqual([{ name: 'Celerity: Reflex', rare: false }]);
    expect(element.querySelector('.filigree-picker')).toBeNull();
  });

  it('keeps the picker\'s Rare copy box as ticked through change detection, showing rare bonuses', async () => {
    equipped.set(weapon());
    const element = render('weapon');
    expand(element);
    element.querySelector<HTMLButtonElement>('.filigree-slot-pick')!.click();
    for (let tries = 0; tries < 50 && !element.querySelector('.filigree-picker'); tries++) {
      await TestBed.inject(ApplicationRef).whenStable();
      await new Promise(resolve => setTimeout(resolve, 20));
      fixture.detectChanges();
    }
    const search = element.querySelector<HTMLInputElement>('.filigree-picker-search')!;
    search.value = 'celerity: dexterity';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(element.querySelector('.filigree-picker-entry-rare')).toBeNull();

    const rareBox = Array.from(element.querySelectorAll<HTMLLabelElement>('.filigree-picker-check'))
      .find(label => label.textContent!.includes('Rare copy'))!.querySelector('input')!;
    rareBox.click();
    fixture.detectChanges();
    fixture.detectChanges();

    expect(element.querySelector('.filigree-picker-entry-rare')!.textContent).toContain('Physical Sheltering +2');
  });
});
