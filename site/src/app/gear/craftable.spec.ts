import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';

/**
 * Characterization suite for the crafting-system state machine: what
 * craftable.ts does today, drift and all. Written before any rewrite of it,
 * so the behaviour a URL depends on is pinned rather than remembered.
 *
 * The shapes that matter are the param descriptions, since they travel in
 * saved and shared build URLs:
 *   ""                       nothing selected
 *   "Diamond of Con +15"     an option, on a craftable with no systems
 *   "Blue Augment Slot: X"   an option chosen within a crafting system
 *   "Blue Augment Slot (empty)"  a system chosen, no option in it yet
 */

function option(name: string): CraftableOption {
  return new CraftableOption({ name, affixes: [] });
}

/** A craftable offering two systems that share an option name ("Diamond"). */
function augmentSlot(): Craftable {
  const craftable = new Craftable('Augment Slot 1', []);
  craftable.setCraftingSystemOptions(new Map([
    ['Colorless Augment Slot', [option('Diamond'), option('Topaz')]],
    ['Blue Augment Slot', [option('Diamond'), option('Sapphire')]],
  ]));
  return craftable;
}

describe('Craftable', () => {
  it('should create an instance', () => {
    expect(new Craftable('Prefix', [new CraftableOption(null)])).toBeTruthy();
  });

  describe('plain option list (no crafting systems)', () => {
    let craftable: Craftable;

    beforeEach(() => {
      craftable = new Craftable('Prefix', [option('Meltfang'), option('Iridescent Claw')]);
    });

    it('starts on an empty option prepended to the list', () => {
      expect(craftable.options.length).toBe(3);
      expect(craftable.selected.getParamDescription()).toBe('');
      expect(craftable.getSelectedParamDescription()).toBe('');
      expect(craftable.hasCraftingSystemOptions()).toBe(false);
    });

    it('keeps the caller-supplied first option when addEmptyOption is false', () => {
      const noEmpty = new Craftable('Prefix', [option('Meltfang')], false);

      expect(noEmpty.options.length).toBe(1);
      expect(noEmpty.selected.getParamDescription()).toBe('Meltfang');
    });

    it('selects by description and round-trips it', () => {
      expect(craftable.selectByParamDescription('Meltfang')).toBe(true);
      expect(craftable.getSelectedParamDescription()).toBe('Meltfang');
    });

    it('reports failure, leaving the selection alone, for an unknown description', () => {
      craftable.selectByParamDescription('Meltfang');

      expect(craftable.selectByParamDescription('Not An Option')).toBe(false);
      expect(craftable.getSelectedParamDescription()).toBe('Meltfang');
    });
  });

  describe('crafting systems', () => {
    let craftable: Craftable;

    beforeEach(() => {
      craftable = augmentSlot();
    });

    it('offers its systems, with nothing selected until asked', () => {
      expect(craftable.hasCraftingSystemOptions()).toBe(true);
      expect(craftable.craftingSystemOptions).toEqual(['Colorless Augment Slot', 'Blue Augment Slot']);
      expect(craftable.selectedCraftingSystemName).toBe('');
      expect(craftable.getSelectedParamDescription()).toBe('');
    });

    it('offers only the chosen system\'s options, plus an empty one', () => {
      craftable.selectCraftingSystem('Blue Augment Slot');

      expect(craftable.options.map(o => o.getParamDescription())).toEqual(['', 'Diamond', 'Sapphire']);
      expect(craftable.selected.getParamDescription()).toBe('');
    });

    it('describes a system chosen with no option as "<system> (empty)"', () => {
      craftable.selectCraftingSystem('Blue Augment Slot');

      expect(craftable.getSelectedParamDescription()).toBe('Blue Augment Slot (empty)');
    });

    it('prefixes a chosen option with its system', () => {
      craftable.selectCraftingSystem('Blue Augment Slot');
      craftable.selected = craftable.options.find(o => o.getParamDescription() === 'Sapphire')!;

      expect(craftable.getSelectedParamDescription()).toBe('Blue Augment Slot: Sapphire');
    });

    it('round-trips a system-scoped selection', () => {
      expect(craftable.selectByParamDescription('Blue Augment Slot: Sapphire')).toBe(true);
      expect(craftable.selectedCraftingSystemName).toBe('Blue Augment Slot');
      expect(craftable.getSelectedParamDescription()).toBe('Blue Augment Slot: Sapphire');
    });

    it('round-trips the (empty) sentinel', () => {
      expect(craftable.selectByParamDescription('Blue Augment Slot (empty)')).toBe(true);
      expect(craftable.selectedCraftingSystemName).toBe('Blue Augment Slot');
      expect(craftable.getSelectedParamDescription()).toBe('Blue Augment Slot (empty)');
    });

    it('clears the system for an empty description', () => {
      craftable.selectByParamDescription('Blue Augment Slot: Sapphire');

      expect(craftable.selectByParamDescription('')).toBe(true);
      expect(craftable.selectedCraftingSystemName).toBe('');
      expect(craftable.getSelectedParamDescription()).toBe('');
    });

    it('resolves an option name shared by two systems to the one that names it', () => {
      // "Diamond" exists in both systems - this is why descriptions carry
      // their system name (SYSTEM_SELECTION_SEPARATOR's comment).
      expect(craftable.selectByParamDescription('Blue Augment Slot: Diamond')).toBe(true);
      expect(craftable.selectedCraftingSystemName).toBe('Blue Augment Slot');

      expect(craftable.selectByParamDescription('Colorless Augment Slot: Diamond')).toBe(true);
      expect(craftable.selectedCraftingSystemName).toBe('Colorless Augment Slot');
    });

    it('keeps the current system for a bare description it also offers (older URLs)', () => {
      craftable.selectCraftingSystem('Blue Augment Slot');

      expect(craftable.selectByParamDescription('Diamond')).toBe(true);
      expect(craftable.selectedCraftingSystemName).toBe('Blue Augment Slot');
    });

    it('falls back to the first system offering a bare description', () => {
      expect(craftable.selectByParamDescription('Sapphire')).toBe(true);
      expect(craftable.selectedCraftingSystemName).toBe('Blue Augment Slot');
    });

    // A failed restore reports false and changes nothing. (It used to clear the
    // craftable, because the search selected each candidate system in turn.)
    it('leaves the selection alone for a description naming an unavailable system', () => {
      craftable.selectByParamDescription('Blue Augment Slot: Sapphire');

      expect(craftable.selectByParamDescription('Green Augment Slot: Emerald')).toBe(false);
      expect(craftable.getSelectedParamDescription()).toBe('Blue Augment Slot: Sapphire');
    });

    it('leaves the selection alone for an unknown option within a known system', () => {
      craftable.selectByParamDescription('Blue Augment Slot: Sapphire');

      expect(craftable.selectByParamDescription('Blue Augment Slot: Nonexistent')).toBe(false);
      expect(craftable.getSelectedParamDescription()).toBe('Blue Augment Slot: Sapphire');
    });

    it('hands out defensive copies of its per-system options', () => {
      const copy = craftable.getOptionsByCraftingSystem();
      copy.get('Blue Augment Slot')![0].name = 'Mutated';

      expect(craftable.getOptionsByCraftingSystem().get('Blue Augment Slot')![0].name).toBe('Diamond');
    });
  });

  describe('setAvailableCraftingSystemOptions', () => {
    let craftable: Craftable;

    beforeEach(() => {
      craftable = augmentSlot();
    });

    it('narrows the offered systems to those still available', () => {
      craftable.setAvailableCraftingSystemOptions(['Colorless Augment Slot']);

      expect(craftable.craftingSystemOptions).toEqual(['Colorless Augment Slot']);
    });

    it('ignores a system the craftable was never built with', () => {
      craftable.setAvailableCraftingSystemOptions(['Colorless Augment Slot', 'Green Augment Slot']);

      expect(craftable.craftingSystemOptions).toEqual(['Colorless Augment Slot']);
    });

    it('keeps the chosen option when its system survives and is re-selected', () => {
      craftable.selectByParamDescription('Blue Augment Slot: Sapphire');

      craftable.setAvailableCraftingSystemOptions(['Colorless Augment Slot', 'Blue Augment Slot'], 'Blue Augment Slot');

      expect(craftable.getSelectedParamDescription()).toBe('Blue Augment Slot: Sapphire');
    });

    it('drops the chosen option when a different system is selected', () => {
      craftable.selectByParamDescription('Blue Augment Slot: Sapphire');

      craftable.setAvailableCraftingSystemOptions(['Colorless Augment Slot', 'Blue Augment Slot'], 'Colorless Augment Slot');

      expect(craftable.getSelectedParamDescription()).toBe('Colorless Augment Slot (empty)');
    });

    it('drops the selection entirely when no system is re-selected', () => {
      craftable.selectByParamDescription('Blue Augment Slot: Sapphire');

      craftable.setAvailableCraftingSystemOptions(['Colorless Augment Slot', 'Blue Augment Slot']);

      expect(craftable.selectedCraftingSystemName).toBe('');
      expect(craftable.getSelectedParamDescription()).toBe('');
    });

    it('drops the selection when its system is no longer available', () => {
      craftable.selectByParamDescription('Blue Augment Slot: Sapphire');

      craftable.setAvailableCraftingSystemOptions(['Colorless Augment Slot'], 'Blue Augment Slot');

      expect(craftable.craftingSystemOptions).toEqual(['Colorless Augment Slot']);
      expect(craftable.selectedCraftingSystemName).toBe('');
    });
  });

  describe('clone', () => {
    it('copies options, availability and selection without a string round-trip', () => {
      const craftable = augmentSlot();
      craftable.setAvailableCraftingSystemOptions(['Blue Augment Slot'], 'Blue Augment Slot');
      craftable.selectByParamDescription('Blue Augment Slot: Sapphire');

      const copy = craftable.clone();

      expect(copy.name).toBe(craftable.name);
      expect(copy.getSelectedParamDescription()).toBe('Blue Augment Slot: Sapphire');
      // The narrowed availability survives the copy. Copying via the param
      // description used to re-offer every system the craftable was built with.
      expect(copy.craftingSystemOptions).toEqual(['Blue Augment Slot']);
      expect(Array.from(copy.getOptionsByCraftingSystem().keys()))
        .toEqual(['Colorless Augment Slot', 'Blue Augment Slot']);
    });

    it('is independent of its source', () => {
      const craftable = augmentSlot();
      craftable.selectByParamDescription('Blue Augment Slot: Sapphire');

      const copy = craftable.clone();
      copy.selectByParamDescription('Colorless Augment Slot: Topaz');
      copy.options[1].name = 'Mutated';

      expect(craftable.getSelectedParamDescription()).toBe('Blue Augment Slot: Sapphire');
      expect(craftable.options[1].name).not.toBe('Mutated');
    });

    it('copies a plain option list and its selection', () => {
      const craftable = new Craftable('Prefix', [option('Meltfang'), option('Iridescent Claw')]);
      craftable.selectByParamDescription('Iridescent Claw');

      const copy = craftable.clone();

      expect(copy.options.map(o => o.getParamDescription())).toEqual(['', 'Meltfang', 'Iridescent Claw']);
      expect(copy.getSelectedParamDescription()).toBe('Iridescent Claw');
      expect(copy.hasCraftingSystemOptions()).toBe(false);
    });
  });

  describe('matching a tracked bonus type', () => {
    it('finds and selects the first option granting it', () => {
      const craftable = new Craftable('Prefix', [
        new CraftableOption({ name: 'Con 14', affixes: [{ name: 'Constitution', type: 'Enhancement', value: 14 }] }),
        new CraftableOption({ name: 'Con 15', affixes: [{ name: 'Constitution', type: 'Enhancement', value: 15 }] }),
      ]);

      expect(craftable.getMatchingBonusType('Constitution', 'Enhancement')).toBe(14);
      expect(craftable.selectMatchingBonusType('Constitution', 'Enhancement')).toBe(true);
      expect(craftable.getSelectedParamDescription()).toBe('Con 14');
    });

    it('reports no match without changing the selection', () => {
      const craftable = new Craftable('Prefix', [option('Meltfang')]);

      expect(craftable.getMatchingBonusType('Constitution', 'Enhancement')).toBeNull();
      expect(craftable.selectMatchingBonusType('Constitution', 'Enhancement')).toBe(false);
      expect(craftable.getSelectedParamDescription()).toBe('');
    });
  });
});
