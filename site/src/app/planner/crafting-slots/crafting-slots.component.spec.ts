import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';

import { CraftingOptionPickerComponent } from '../../crafting-option-picker/crafting-option-picker.component';
import { CraftingSlotControlComponent } from '../../crafting-slot-control/crafting-slot-control.component';
import { Craftable } from '../../gear/craftable';
import { CraftableOption } from '../../gear/craftable-option';
import { Item } from '../../gear/item';
import { UserItemLocationTooltipPipe } from '../../shared/user-item-location-tooltip.pipe';
import { TapTooltipComponent, TapTooltipPanelComponent } from '../../tap-tooltip/tap-tooltip.component';
import { SlotIconComponent } from '../../slot-icon/slot-icon.component';
import { EquippedService } from '../equipped.service';
import { CraftingSlotsComponent } from './crafting-slots.component';

describe('CraftingSlotsComponent', () => {
  let fixture: ComponentFixture<CraftingSlotsComponent>;
  let equipped: EquippedService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [
        CraftingSlotsComponent, CraftingSlotControlComponent, CraftingOptionPickerComponent,
        TapTooltipComponent, TapTooltipPanelComponent, SlotIconComponent, UserItemLocationTooltipPipe
      ],
      imports: [FormsModule, NgbModule]
    }).compileComponents();
    equipped = TestBed.inject(EquippedService);
  });

  async function render() {
    fixture = TestBed.createComponent(CraftingSlotsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const text = (selector: string) => Array.from(el().querySelectorAll(selector)).map(node => node.textContent!.trim().replace(/\s+/g, ' '));
  const chips = () => Array.from(el().querySelectorAll('.crafting-summary-chip')).map(chip => chip.getAttribute('aria-label'));
  const group = (name: string) => Array.from(el().querySelectorAll<HTMLElement>('.crafting-group'))
    .find(section => section.querySelector('.crafting-group-name')!.textContent!.trim() === name)!;

  it('says there is nothing to show when no equipped gear has crafting slots', async () => {
    await render();

    expect(el().querySelector('.crafting-slots-none')).toBeTruthy();
    expect(el().querySelector('.crafting-group')).toBeNull();
  });

  it('groups the slots by type, naming the gear slot and item each is on, and counts the colours', async () => {
    equipped.set(item('Helm', 'Sunny Helm', 'Sun Augment Slot', 'Blue Augment Slot'));
    equipped.set(item('Belt', 'Sunny Belt', 'Sun Augment Slot'));
    await render();

    expect(chips()).toEqual(['Sun: 2 empty', 'Blue: 1 empty']);
    expect(text('.crafting-group-name')).toEqual(['Sun Augment Slot', 'Blue Augment Slot']);
    // Each row's gear is an icon, named on hover.
    const sunRows = Array.from(group('Sun Augment Slot').querySelectorAll<HTMLElement>('.crafting-slot-row .tap-tooltip-trigger'))
      .map(trigger => trigger.title);
    expect(sunRows).toEqual(['Helm: Sunny Helm', 'Belt: Sunny Belt']);
    expect(group('Sun Augment Slot').querySelector('.crafting-slot-row app-slot-icon svg')).toBeTruthy();
    // The group header names the slot, so the rows don't repeat it.
    expect(group('Sun Augment Slot').querySelector('.crafting-slot-row')!.textContent).not.toContain('Sun Augment Slot');
  });

  it('equips the item with an option chosen in a row, and counts the slot as filled', async () => {
    equipped.set(item('Helm', 'Sunny Helm', 'Sun Augment Slot'));
    equipped.set(item('Belt', 'Sunny Belt', 'Sun Augment Slot'));
    await render();

    const select = group('Sun Augment Slot').querySelectorAll<HTMLElement>('.crafting-slot-row')[1].querySelector('select')!;
    select.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    select.selectedIndex = Array.from(select.options).findIndex(option => option.textContent!.trim() === 'Sun Augment Slot Gem');
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(equipped.getSlotsSnapshot().get('Belt')!.getCraftingByName('Sun Augment Slot')!.selected.name).toBe('Sun Augment Slot Gem');
    expect(chips()).toEqual(['Sun: 1 empty']);
    expect(Array.from(group('Sun Augment Slot').querySelectorAll('.crafting-slot-row'))
      .map(row => row.classList.contains('is-empty'))).toEqual([true, false]);
  });

  it('colours the chosen option by how it ranks, as the gear cards do', async () => {
    equipped.addImportantAffix('Strength');
    const helm = item('Helm', 'Sunny Helm', 'Sun Augment Slot');
    helm.crafting[0].selected = helm.crafting[0].options[1];
    equipped.set(helm);
    await render();

    const select = el().querySelector<HTMLSelectElement>('.crafting-slot-row select')!;
    // The colour itself is a global style, scoped in styles.css to the views that show rank colours.
    expect(select.classList).toContain('Best');
  });

  it('shows only the empty slots when asked, leaving out groups with none', async () => {
    const helm = item('Helm', 'Sunny Helm', 'Sun Augment Slot', 'Blue Augment Slot');
    helm.getCraftingByName('Blue Augment Slot')!.selected = helm.getCraftingByName('Blue Augment Slot')!.options[1];
    equipped.set(helm);
    equipped.set(item('Belt', 'Sunny Belt', 'Sun Augment Slot'));
    await render();

    (el().querySelector('.crafting-only-empty') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(text('.crafting-group-name')).toEqual(['Sun Augment Slot']);
    expect(el().querySelectorAll('.crafting-slot-row')).toHaveLength(2);
  });

  it('collapses and expands a group from its header', async () => {
    equipped.set(item('Helm', 'Sunny Helm', 'Sun Augment Slot'));
    await render();
    const header = el().querySelector<HTMLButtonElement>('.crafting-group-header')!;

    header.click();
    fixture.detectChanges();
    expect(header.getAttribute('aria-expanded')).toBe('false');
    expect(el().querySelector('.crafting-slot-row')).toBeNull();

    header.click();
    fixture.detectChanges();
    expect(el().querySelector('.crafting-slot-row')).toBeTruthy();
  });

  describe('swapping augments', () => {
    const row = (groupName: string, index = 0) => group(groupName).querySelectorAll<HTMLElement>('.crafting-slot-row')[index];
    const chosen = (gearSlot: string, system: string) =>
      equipped.getSlotsSnapshot().get(gearSlot)!.getCraftingByName(system)!.selected.getParamDescription();
    const status = () => el().querySelector('.crafting-swap-status')!.textContent!.trim().replace(/\s+/g, ' ');
    const click = (button: Element | null) => {
      (button as HTMLButtonElement).click();
      fixture.detectChanges();
    };

    function equipWith(gearSlot: string, name: string, choices: Record<string, string>): void {
      const result = item(gearSlot, name, ...Object.keys(choices));
      for (const [system, choice] of Object.entries(choices)) {
        const craft = result.getCraftingByName(system)!;
        craft.selected = craft.options.find(option => option.name === choice) ?? craft.options[0];
      }
      equipped.set(result);
    }

    beforeEach(() => {
      equipWith('Helm', 'Helm', { 'Blue Augment Slot': 'Blue Augment Slot Gem' });
      equipWith('Belt', 'Belt', { 'Purple Augment Slot': 'Blue Augment Slot Stone', 'Red Augment Slot': 'Red Augment Slot Gem' });
      equipWith('Boots', 'Boots', { 'Blue Augment Slot': '' });
    });

    it('offers only the slots that take the picked augment', async () => {
      await render();

      click(row('Blue Augment Slot').querySelector('.crafting-swap-button'));

      expect(row('Blue Augment Slot').querySelector('.crafting-swap-button')!.getAttribute('aria-pressed')).toBe('true');
      expect(status()).toContain('Swapping the Helm Blue augment');
      // Another colour that takes it, and an empty slot of its own.
      expect(row('Purple Augment Slot').querySelector('.crafting-swap-here')!.textContent!.trim()).toBe('Swap here');
      expect(row('Blue Augment Slot', 1).querySelector('.crafting-swap-here')!.textContent!.trim()).toBe('Move here');
      expect(row('Red Augment Slot').querySelector('.crafting-swap-here')).toBeNull();
      expect(row('Red Augment Slot').classList).toContain('is-swap-unavailable');
    });

    it('swaps across colours, and undoes it', async () => {
      await render();

      click(row('Blue Augment Slot').querySelector('.crafting-swap-button'));
      click(row('Purple Augment Slot').querySelector('.crafting-swap-here'));

      expect(chosen('Helm', 'Blue Augment Slot')).toBe('Blue Augment Slot Stone');
      expect(chosen('Belt', 'Purple Augment Slot')).toBe('Blue Augment Slot Gem');
      expect(status()).toContain('Swapped the Helm Blue and Belt Purple augments.');
      expect(el().querySelector('.crafting-swap-here')).toBeNull();
      expect(el().querySelector('.is-swap-unavailable')).toBeNull();

      click(Array.from(el().querySelectorAll('.crafting-swap-action')).find(button => button.textContent!.trim() === 'Undo')!);

      expect(chosen('Helm', 'Blue Augment Slot')).toBe('Blue Augment Slot Gem');
      expect(chosen('Belt', 'Purple Augment Slot')).toBe('Blue Augment Slot Stone');
      expect(status()).toBe('');
    });

    it('moves an augment into an empty slot, and back on Undo', async () => {
      await render();

      click(row('Blue Augment Slot').querySelector('.crafting-swap-button'));
      click(row('Blue Augment Slot', 1).querySelector('.crafting-swap-here'));

      expect(chosen('Helm', 'Blue Augment Slot')).toBe('');
      expect(chosen('Boots', 'Blue Augment Slot')).toBe('Blue Augment Slot Gem');
      expect(status()).toContain('Moved the Helm Blue augment to the Boots Blue slot.');

      click(el().querySelector('.crafting-swap-action'));

      expect(chosen('Helm', 'Blue Augment Slot')).toBe('Blue Augment Slot Gem');
      expect(chosen('Boots', 'Blue Augment Slot')).toBe('');
    });

    it('cancels with the button, Escape, or the picked row\'s own swap button', async () => {
      await render();
      const pick = () => click(row('Blue Augment Slot').querySelector('.crafting-swap-button'));

      pick();
      click(el().querySelector('.crafting-swap-action'));
      expect(el().querySelector('.crafting-swap-here')).toBeNull();

      pick();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(el().querySelector('.crafting-swap-here')).toBeNull();

      pick();
      pick();
      expect(el().querySelector('.crafting-swap-here')).toBeNull();
      expect(status()).toBe('');
      expect(chosen('Helm', 'Blue Augment Slot')).toBe('Blue Augment Slot Gem');
    });

    it('opens a collapsed group that holds a slot to swap with', async () => {
      await render();
      click(group('Purple Augment Slot').querySelector('.crafting-group-header'));
      expect(row('Purple Augment Slot')).toBeUndefined();

      click(row('Blue Augment Slot').querySelector('.crafting-swap-button'));

      expect(row('Purple Augment Slot').querySelector('.crafting-swap-here')).toBeTruthy();
    });
  });
});

function item(gearSlot: string, name: string, ...systems: string[]): Item {
  const result = new Item(null);
  result.name = name;
  result.slot = gearSlot;
  result.ml = 30;
  result.crafting = systems.map(system => new Craftable(system, optionsFor(system)));
  return result;
}

// Shared between items, as GearDbService's are, with Purple taking the Blue augments too.
const sharedOptions = new Map<string, CraftableOption[]>();
function optionsFor(system: string): CraftableOption[] {
  if (system === 'Purple Augment Slot') {
    return [...ownOptions(system), ...ownOptions('Blue Augment Slot')];
  }
  return ownOptions(system);
}

function ownOptions(system: string): CraftableOption[] {
  let options = sharedOptions.get(system);
  if (!options) {
    options = [
      new CraftableOption({ name: `${system} Gem`, ml: 1, affixes: [{ name: 'Strength', type: 'Enhancement', value: 1 }] }),
      new CraftableOption({ name: `${system} Stone`, ml: 1, affixes: [{ name: 'Dexterity', type: 'Enhancement', value: 1 }] }),
    ];
    sharedOptions.set(system, options);
  }
  return options;
}
