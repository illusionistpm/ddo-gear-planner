import { TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { Craftable } from '../gear/craftable';
import { CraftableOption } from '../gear/craftable-option';
import { EquippedService } from '../planner/equipped.service';
import { Item } from '../gear/item';
import { SlotUndoService } from './slot-undo.service';
import { UndoOffer, UndoService } from './undo.service';

describe('SlotUndoService', () => {
  let equipped: EquippedService;
  let slotUndo: SlotUndoService;
  let undo: UndoService;
  let offer: UndoOffer | null;

  const helm = (name: string) => new Item({ name, slot: 'Helm', type: 'Helm', ml: 30, affixes: [], crafting: [], quests: [] });

  /** Does the edit the way its callers do: a snapshot, the edit, then the offer. */
  function edit(change: () => void) {
    const before = slotUndo.before();
    change();
    slotUndo.offerUndo(before);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AppModule] });
    equipped = TestBed.inject(EquippedService);
    slotUndo = TestBed.inject(SlotUndoService);
    undo = TestBed.inject(UndoService);
    undo.offer$.subscribe(value => offer = value);
  });

  const helmName = () => equipped.getSlotsSnapshot().get('Helm')?.name;

  it('offers nothing for an item equipped into an empty slot', () => {
    edit(() => equipped.set(helm('First Helm')));

    expect(offer).toBeNull();
  });

  it('puts a cleared item back, with its crafting choice', () => {
    const crafted = helm('First Helm');
    const slot = new Craftable('Green Augment Slot', [
      new CraftableOption({ affixes: [{ name: 'Strength', type: 'Enhancement', value: 5 }] })
    ]);
    slot.selected = slot.options[slot.options.length - 1];
    crafted.crafting = [slot];
    equipped.set(crafted);

    edit(() => equipped.clearSlot('Helm'));
    expect(offer?.message).toBe('Cleared Helm: First Helm');
    expect(helmName()).toBeUndefined();

    undo.undo();
    const restored = equipped.getSlotsSnapshot().get('Helm');
    expect(restored?.name).toBe('First Helm');
    expect(restored?.crafting[0].selected.affixes[0]?.name).toBe('Strength');
  });

  it('puts back the item another was equipped over', () => {
    equipped.set(helm('First Helm'));

    edit(() => equipped.set(helm('Second Helm')));
    expect(offer?.message).toBe('Replaced First Helm with Second Helm');

    undo.undo();
    expect(helmName()).toBe('First Helm');
  });

  it('offers nothing when the same item is set again, as a crafting change does', () => {
    equipped.set(helm('First Helm'));

    edit(() => equipped.set(helm('First Helm')));

    expect(offer).toBeNull();
  });

  it('withdraws the offer once the slot changes again', () => {
    equipped.set(helm('First Helm'));
    edit(() => equipped.clearSlot('Helm'));
    expect(offer).not.toBeNull();

    equipped.set(helm('Third Helm'));

    expect(offer).toBeNull();
    expect(helmName()).toBe('Third Helm');
  });
});
