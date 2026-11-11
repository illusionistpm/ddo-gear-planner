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

  function render(setName: string | string[] = 'Ultimate Fury'): HTMLElement {
    fixture = TestBed.createComponent(FiligreeSetDetailsComponent);
    fixture.componentRef.setInput('setNames', Array.isArray(setName) ? setName : [setName]);
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

  it('shows a bonus\'s value and type, and nothing beside an on/off effect', () => {
    const element = render('Splendid Cacophony');
    const values = tierRows(element).map(row => row.querySelector('.set-bonus-summary-value')!.textContent!.trim());

    expect(values[0]).toBe('+2 Filigree Set');
    // 4 pieces: "Your Inspire Courage grants ...", not "+1 Bool".
    expect(values[values.length - 1]).toBe('');
  });

  it("shows both of a raid filigree's sets: each one's bonuses, then the pieces in both, then each one's own", () => {
    const element = render(['Eye of the Beholder', 'The Inevitable Grave']);
    const subtitles = Array.from(element.querySelectorAll('.filigree-set-subtitle'), title => title.textContent!.trim());

    expect(subtitles).toEqual(['Eye of the Beholder', 'The Inevitable Grave', 'Both sets', 'Eye of the Beholder', 'The Inevitable Grave']);
    expect(element.querySelectorAll('.set-bonus-summary-list').length).toBe(2);
    const groups = Array.from(element.querySelectorAll('.filigree-set-pieces'), group =>
      Array.from(group.querySelectorAll('.filigree-set-piece-name'), name => name.firstChild!.textContent!.trim()));
    // The raid filigree once, by its short name under "Both sets"; set-mates by theirs.
    expect(groups[0]).toEqual(['Intelligence']);
    expect(groups[1]).toContain('Intelligence');
    expect(groups.flat().filter(label => label.includes('/'))).toEqual([]);
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
    expect(tierRows(element).map(row => row.classList.contains('disabled-set-tier'))).toEqual([false, true, true, true, true]);
    expect(pieceRow(element, 'Strength').querySelector('.filigree-set-piece-slotted')!.textContent!.trim()).toBe('×1 slotted');
  });

  it('disables a host the filigree is already in, as the bonus-type drawer does', () => {
    equipped.set(weapon());
    equipped.set(artifact(2));
    const element = render();

    button(pieceRow(element, 'Strength'), 'Weapon').click();
    fixture.detectChanges();

    expect(button(pieceRow(element, 'Strength'), 'Weapon').disabled).toBe(true);
    expect(button(pieceRow(element, 'Strength'), 'Weapon').title).toBe('Already in the weapon');
    expect(button(pieceRow(element, 'Strength'), 'Artifact').disabled).toBe(false);
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
