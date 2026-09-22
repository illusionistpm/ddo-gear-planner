import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';

import { AppModule } from '../app.module';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { TypeaheadComponent } from '../typeahead/typeahead.component';
import { ExternalAffixSlotCardComponent } from './external-affix-slot-card.component';

describe('ExternalAffixSlotCardComponent', () => {
  let fixture: ComponentFixture<ExternalAffixSlotCardComponent>;
  let equipped: EquippedService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule]
    }).compileComponents();
  });

  beforeEach(() => {
    equipped = TestBed.inject(EquippedService);
    const gearDB = TestBed.inject(GearDbService);
    const typesByAffix = new Map([
      ['Strength', ['Insight', 'Enhancement']],
      ['Feather Falling', ['Bool']],
      ['Max Filigree Slots', ['Untyped']],
    ]);
    vi.spyOn(gearDB, 'getAllAffixes').mockReturnValue(Array.from(typesByAffix.keys()));
    vi.spyOn(gearDB, 'getTypesForAffix').mockImplementation(name => typesByAffix.get(name) ?? []);
    fixture = TestBed.createComponent(ExternalAffixSlotCardComponent);
    fixture.detectChanges();
  });

  const el = () => fixture.nativeElement as HTMLElement;

  function rowTexts(): string[] {
    return Array.from<HTMLElement>(el().querySelectorAll('.external-affix-row'))
      .map(row => Array.from<HTMLElement>(row.querySelectorAll('div')).map(cell => cell.textContent!.trim()).join(' | '));
  }

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openAddPanel() {
    el().querySelector<HTMLButtonElement>('.external-add-button')!.click();
    await settle();
  }

  /** Picks an affix the way the typeahead does when a result is chosen. */
  async function pickAffix(name: string) {
    const typeahead = fixture.debugElement.query(By.directive(TypeaheadComponent)).componentInstance as TypeaheadComponent;
    typeahead.onSelectItemMine({ item: { name } } as never);
    await settle();
  }

  async function chooseBonusType(value: string) {
    const select = el().querySelector<HTMLSelectElement>('.external-add-bonus-type')!;
    select.value = value;
    select.dispatchEvent(new Event('change'));
    await settle();
  }

  async function type(selector: string, text: string) {
    const input = el().querySelector<HTMLInputElement>(selector)!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await settle();
  }

  async function clickFormButton(text: string) {
    Array.from(el().querySelectorAll<HTMLButtonElement>('.external-affix-form button'))
      .find(button => button.textContent!.trim() === text)!.click();
    await settle();
  }

  describe('keyboard focus while adding', () => {
    const focusedIs = (selector: string) => document.activeElement === el().querySelector(selector);

    it('goes to the affix search when the panel opens', async () => {
      await openAddPanel();
      expect(focusedIs('app-typeahead input')).toBe(true);
    });

    it('goes to the bonus type when the affix has several to choose from', async () => {
      await openAddPanel();
      await pickAffix('Strength');
      expect(focusedIs('.external-add-bonus-type')).toBe(true);
    });

    it('goes to the source label once the bonus type is chosen', async () => {
      await openAddPanel();
      await pickAffix('Strength');
      await chooseBonusType('Insight');
      expect(focusedIs('.external-affix-label-input')).toBe(true);
    });

    it('skips straight to the source label when the affix has only one bonus type', async () => {
      await openAddPanel();
      await pickAffix('Feather Falling');
      expect(focusedIs('.external-affix-label-input')).toBe(true);
    });
  });

  it('shows its title and a hint when there are no entries', () => {
    expect(el().querySelector('.external-slot-title')?.textContent?.trim()).toBe('Non-gear');
    expect(el().querySelector('.external-affix-empty')).not.toBeNull();
    expect(el().querySelector('.external-affix-row')).toBeNull();
  });

  it('renders each non-gear entry with its label and value', () => {
    equipped.addExternalAffixValue('Strength', 'Insight', 3, 'Spell');
    equipped.addExternalAffixIgnored('Wisdom', 'Quality', 'Skip');
    fixture.detectChanges();

    expect(rowTexts()).toEqual([
      'Strength (Spell) | +3 Insight',
      'Wisdom (Skip) | Quality',
    ]);
    expect(el().querySelector('.external-affix-empty')).toBeNull();
  });

  it('shows a checklist entry as a checked box instead of a value', () => {
    equipped.addExternalAffixValue('Feather Falling', 'Bool', 1, 'Ring');
    fixture.detectChanges();

    expect(rowTexts()).toEqual(['Feather Falling (Ring) | ']);
    expect(el().querySelector('.external-affix-row .fa-square-check')?.getAttribute('aria-label')).toBe('Covered');
  });

  describe('adding an entry from the heading', () => {
    it('opens the add panel from the heading button and closes it again', async () => {
      expect(el().querySelector('.external-add-panel')).toBeNull();

      await openAddPanel();
      expect(el().querySelector('.external-add-panel')).not.toBeNull();
      expect(el().querySelector('.external-affix-empty')).toBeNull();

      await openAddPanel();
      expect(el().querySelector('.external-add-panel')).toBeNull();
    });

    it('renders the affix search results outside the card, which clips its overflow', async () => {
      await openAddPanel();

      const typeahead = fixture.debugElement.query(By.directive(TypeaheadComponent)).componentInstance as TypeaheadComponent;
      expect(typeahead.container).toBe('body');
    });

    it('offers only affixes that can take a non-gear source', () => {
      expect(fixture.componentInstance.affixSource.map(entry => entry.name)).toEqual(['Strength', 'Feather Falling']);
    });

    it('lists the chosen affix\'s bonus types and waits for one to be picked', async () => {
      await openAddPanel();
      await pickAffix('Strength');

      const options = Array.from(el().querySelectorAll<HTMLOptionElement>('.external-add-bonus-type option'));
      expect(options.map(option => option.textContent!.trim())).toEqual(['Bonus type', 'Insight', 'Enhancement']);
      expect(el().querySelector('.external-affix-form')).toBeNull();
    });

    it('records a value for the chosen affix and bonus type, then closes the panel', async () => {
      await openAddPanel();
      await pickAffix('Strength');
      await chooseBonusType('Insight');

      await type('.external-affix-label-input', 'Spell');
      await type('.external-affix-value-input', '3');
      await clickFormButton('Add');

      expect(rowTexts()).toEqual(['Strength (Spell) | +3 Insight']);
      expect(el().querySelector('.external-add-panel')).toBeNull();
    });

    it('skips the bonus type choice when the affix has only one', async () => {
      await openAddPanel();
      await pickAffix('Feather Falling');

      expect(el().querySelector('.external-affix-form')).not.toBeNull();
      expect(el().querySelector('.external-affix-value-input')).toBeNull();
    });

    it('ignores the chosen affix and bonus type', async () => {
      await openAddPanel();
      await pickAffix('Strength');
      await chooseBonusType('Enhancement');

      await clickFormButton('Ignore');

      expect(rowTexts()).toEqual(['Strength (Ignored) | Enhancement']);
    });

    it('forgets a half-finished entry when cancelled', async () => {
      await openAddPanel();
      await pickAffix('Strength');
      await openAddPanel();
      await openAddPanel();

      expect(el().querySelector('.external-add-selection')).toBeNull();
    });
  });
});
