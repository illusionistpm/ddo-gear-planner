import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { FiligreeSetDetailsComponent } from './filigree-set-details.component';
import { EquippedService } from '../planner/equipped.service';
import { Item } from '../gear/item';
import { MAX_FILIGREE_SLOTS_AFFIX } from '../affixes/filigree-affix';

const weapon = () => new Item({ name: 'Test Longsword', slot: 'Weapon', type: 'Longswords', ml: 30, affixes: [], crafting: [], quests: [] });
const artifact = (slots: number) => new Item({
  name: 'Test Artifact', slot: 'Trinket', type: 'Trinkets', ml: 30, crafting: [], quests: [], artifact: true,
  affixes: [{ name: MAX_FILIGREE_SLOTS_AFFIX, type: 'Untyped', value: slots }],
});

describe('FiligreeSetDetailsComponent', () => {
  let fixture: ComponentFixture<FiligreeSetDetailsComponent>;
  let equipped: EquippedService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    equipped = TestBed.inject(EquippedService);
  });

  function render(setName = 'Ultimate Fury'): HTMLElement {
    fixture = TestBed.createComponent(FiligreeSetDetailsComponent);
    fixture.componentRef.setInput('setName', setName);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  const pieceRow = (element: HTMLElement, label: string) => Array.from(element.querySelectorAll<HTMLElement>('.filigree-set-piece'))
    .find(row => row.querySelector('.filigree-set-piece-name')!.firstChild!.textContent!.trim() === label)!;
  const button = (row: HTMLElement, text: string) => Array.from(row.querySelectorAll<HTMLButtonElement>('.equip-button'))
    .find(candidate => candidate.textContent!.trim() === text)!;
  const tierRows = (element: HTMLElement) => Array.from(element.querySelectorAll('.set-bonus-summary-row'));

  it('lists the set\'s bonuses, dimmed until enough pieces are slotted', () => {
    const element = render();

    expect(tierRows(element).map(row => row.querySelector('.set-bonus-summary-threshold')!.textContent!.trim()))
      .toEqual(['2 pc', '3 pc', '4 pc', '5 pc', '6 pc']);
    expect(tierRows(element).every(row => row.classList.contains('disabled-set-tier'))).toBe(true);
  });

  it('lists every piece with its bonus and what a rare copy adds, raid filigrees by their full name', () => {
    const element = render();

    const strength = pieceRow(element, 'Strength');
    expect(strength.querySelector('.filigree-set-piece-affixes')!.textContent!.replace(/\s+/g, ' ').trim())
      .toBe('Strength +1 (Rare: Magical Sheltering +2)');
    expect(pieceRow(element, 'Divinity/Ultimate Fury: Strength')).toBeTruthy();
    expect(element.querySelectorAll('.filigree-set-piece').length).toBe(8);
  });

  it('adds a normal copy after the last filigree, lighting up the tiers it reaches', () => {
    equipped.set(weapon());
    const element = render();

    button(pieceRow(element, 'Strength'), 'Weapon').click();
    button(pieceRow(element, 'Constitution'), 'Weapon').click();
    fixture.detectChanges();

    expect(equipped.getFiligreeLoadout().weapon).toEqual([
      { name: 'Ultimate Fury: Strength', rare: false },
      { name: 'Ultimate Fury: Constitution', rare: false },
    ]);
    expect(element.querySelector('.filigree-set-slotted')!.textContent!.trim()).toBe('2 slotted');
    expect(tierRows(element).map(row => row.classList.contains('disabled-set-tier'))).toEqual([false, true, true, true, true]);
    expect(pieceRow(element, 'Strength').querySelector('.filigree-set-piece-slotted')!.textContent!.trim()).toBe('×1 slotted');
  });

  it('allows a second copy in the same host, as a set piece', () => {
    equipped.set(weapon());
    const element = render();
    const strengthWeapon = () => button(pieceRow(element, 'Strength'), 'Weapon');

    strengthWeapon().click();
    fixture.detectChanges();

    expect(strengthWeapon().disabled).toBe(false);
    expect(strengthWeapon().title).toBe('Adds a set piece only: already in the weapon');
    strengthWeapon().click();
    fixture.detectChanges();
    expect(equipped.getFiligreeSetPieces().get('Ultimate Fury')).toBe(2);
  });

  it('disables a host that is missing or full, saying why', () => {
    equipped.set(artifact(1));
    const element = render();
    const row = () => pieceRow(element, 'Strength');

    expect(button(row(), 'Weapon').disabled).toBe(true);
    expect(button(row(), 'Weapon').title).toBe('Equip a main-hand weapon first');
    button(row(), 'Artifact').click();
    fixture.detectChanges();

    expect(button(pieceRow(element, 'Rage'), 'Artifact').disabled).toBe(true);
    expect(button(pieceRow(element, 'Rage'), 'Artifact').title).toBe('No room left');
  });
});
