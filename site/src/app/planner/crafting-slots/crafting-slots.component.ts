import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, HostListener, OnDestroy, OnInit, QueryList, ViewChildren
} from '@angular/core';
import { combineLatest, Subscription } from 'rxjs';

import { CraftingSlotControlComponent } from '../../crafting-slot-control/crafting-slot-control.component';
import { isAugmentSystemName } from '../../gear/augment-slots';
import { CraftableOption } from '../../gear/craftable-option';
import { Item } from '../../gear/item';
import { slotLabel, slotNumber } from '../../gear/slot-display';
import { AnalyticsService } from '../../shared/analytics.service';
import { EquippedService } from '../equipped.service';
import {
  CraftingSlotGroup, CraftingSlotOverview, CraftingSlotRow, CraftingSlotSummary, deriveCraftingSlotOverview, isCraftingSlotEmpty
} from './crafting-slot-groups';
import { canStartCraftingSlotSwap, canSwapCraftingSlots, swapCraftingSlots } from './crafting-slot-swap';

/** How long a swap's Undo stays on offer. */
const UNDO_SWAP_MS = 10_000;

/**
 * The last swap, for Undo: the two rows by key, as rows are derived afresh
 * after every change, and what each held after it, so Undo can tell that
 * nothing has changed since.
 */
interface LastSwap {
  keys: [string, string];
  after: [CraftableOption, CraftableOption];
  message: string;
}

/**
 * Every crafting slot on the equipped gear, grouped by type - so you can see
 * you have four Sun slots, say, and fill them together. In the Equipment
 * panel in place of the gear cards (CraftingSlotsViewService), with the
 * same controls as a card's crafting rows.
 *
 * An augment can trade places with one in another slot that takes it (see
 * canSwapCraftingSlots): tap its row's swap button, then "Swap here" on one of
 * the rows that light up - the same two taps with a mouse, a finger or the
 * keyboard. A short Undo follows, since a stray tap is easy on a phone.
 */
@Component({
  selector: 'app-crafting-slots',
  templateUrl: './crafting-slots.component.html',
  styleUrls: ['./crafting-slots.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class CraftingSlotsComponent implements OnInit, OnDestroy {
  @ViewChildren(CraftingSlotControlComponent) private controls?: QueryList<CraftingSlotControlComponent>;

  readonly slotNumber = slotNumber;
  overview: CraftingSlotOverview = { groups: [], summary: [] };
  onlyEmpty = false;
  /** The row whose augment is being swapped, by key. */
  swapSourceKey: string | null = null;
  lastSwap: LastSwap | null = null;
  private swapTargetKeys = new Set<string>();
  private undoTimer?: ReturnType<typeof setTimeout>;
  private readonly collapsed = new Set<string>();
  private subscription?: Subscription;

  constructor(
    private readonly equipped: EquippedService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly host: ElementRef<HTMLElement>,
    private readonly analytics: AnalyticsService
  ) {}

  ngOnInit(): void {
    this.subscription = combineLatest(Array.from(this.equipped.getSlots().values())).subscribe(() => this.rederive());
  }

  private rederive(): void {
    this.overview = deriveCraftingSlotOverview(this.equipped.getSlotsSnapshot());
    this.updateSwapTargets();
    // A change in one slot changes how options rank in the others, which keep their inputs.
    this.controls?.forEach(control => control.refresh());
    this.changeDetector.markForCheck();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    clearTimeout(this.undoTimer);
  }

  get hasEmptySlots(): boolean {
    return this.overview.groups.some(group => group.empty > 0);
  }

  visibleRows(group: CraftingSlotGroup): CraftingSlotRow[] {
    return this.onlyEmpty ? group.rows.filter(row => row.empty) : group.rows;
  }

  isShown(group: CraftingSlotGroup): boolean {
    return !this.onlyEmpty || group.empty > 0;
  }

  isCollapsed(group: CraftingSlotGroup): boolean {
    return this.collapsed.has(group.name);
  }

  toggle(group: CraftingSlotGroup): void {
    if (!this.collapsed.delete(group.name)) {
      this.collapsed.add(group.name);
    }
  }

  setOnlyEmpty(onlyEmpty: boolean): void {
    this.onlyEmpty = onlyEmpty;
    // Only empty slots means no augment to pick up.
    if (onlyEmpty) {
      this.swapSourceKey = null;
      this.updateSwapTargets();
    }
  }

  groupId(groupName: string): string {
    return 'crafting-group-' + groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  /** The gear slot and item a row's slot is on: "Ring 1: Black Pearl Ring". */
  sourceLabel(row: CraftingSlotRow): string {
    return `${slotLabel(row.gearSlot)}: ${row.item.name}`;
  }

  /** Opens the summary chip's group and scrolls it into view. */
  jumpTo(chip: CraftingSlotSummary): void {
    this.collapsed.delete(chip.groupName);
    if (this.onlyEmpty && !chip.empty) {
      this.onlyEmpty = false;
    }
    this.changeDetector.detectChanges();
    const section = this.host.nativeElement.querySelector<HTMLElement>('#' + this.groupId(chip.groupName));
    section?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
    section?.querySelector<HTMLElement>('.crafting-group-header')?.focus({ preventScroll: true });
  }

  /**
   * The control changed the item's slot in place; equipping it again saves that.
   * Counted again here too: set() emits nothing for an item it won't equip (one
   * of two minor artifacts a loaded build already wears, say), though the
   * change stands on the item, as it does on the gear card.
   */
  onChanged(row: CraftingSlotRow): void {
    this.equipped.set(row.item);
    this.rederive();
  }

  canStartSwap(row: CraftingSlotRow): boolean {
    return canStartCraftingSlotSwap(row.craft);
  }

  get swapSource(): CraftingSlotRow | null {
    return this.swapSourceKey ? this.rowByKey(this.swapSourceKey) : null;
  }

  get hasSwapTargets(): boolean {
    return this.swapTargetKeys.size > 0;
  }

  isSwapSource(row: CraftingSlotRow): boolean {
    return row.key === this.swapSourceKey;
  }

  isSwapTarget(row: CraftingSlotRow): boolean {
    return this.swapTargetKeys.has(row.key);
  }

  /** Picks a row's augment up to swap, or puts it back down if it's the one already picked. */
  toggleSwap(row: CraftingSlotRow): void {
    if (this.isSwapSource(row)) {
      this.cancelSwap();
      return;
    }
    this.clearLastSwap();
    this.swapSourceKey = row.key;
    this.updateSwapTargets();
    // A target in a collapsed group would otherwise be out of reach.
    for (const group of this.overview.groups) {
      if (group.rows.some(candidate => this.isSwapTarget(candidate))) {
        this.collapsed.delete(group.name);
      }
    }
  }

  cancelSwap(): void {
    const source = this.swapSourceKey;
    this.swapSourceKey = null;
    this.updateSwapTargets();
    if (source) {
      this.focusSwapButton(source);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.swapSourceKey) {
      this.cancelSwap();
    }
  }

  /** Swaps the picked augment with the target row's, or moves it there if the target is empty. */
  swapWith(target: CraftingSlotRow): void {
    const source = this.swapSource;
    if (!source || !canSwapCraftingSlots(source.craft, target.craft)) {
      return;
    }
    const move = target.empty;
    const message = move
      ? `Moved the ${this.slotPhrase(source)} augment to the ${this.slotPhrase(target)} slot.`
      : `Swapped the ${this.slotPhrase(source)} and ${this.slotPhrase(target)} augments.`;
    this.analytics.track('swap_crafting_slots', {
      move,
      across_colours: swapColour(source) !== swapColour(target)
    });
    swapCraftingSlots(source.craft, target.craft);
    this.swapSourceKey = null;
    this.save(source.item, target.item);
    this.offerUndo({ keys: [source.key, target.key], after: [source.craft.selected, target.craft.selected], message });
    this.focusSwapButton(target.key);
  }

  /** Swaps the last pair back, as a swap is its own inverse - if neither slot has changed since. */
  undoSwap(): void {
    const last = this.lastSwap;
    this.clearLastSwap();
    const [first, second] = last ? last.keys.map(key => this.rowByKey(key)) : [];
    if (!last || !first || !second || first.craft.selected !== last.after[0] || second.craft.selected !== last.after[1]) {
      return;
    }
    // After a move, the first slot is the empty one: the augment goes back from the second.
    const [from, to] = isCraftingSlotEmpty(first.craft) ? [second, first] : [first, second];
    if (!canSwapCraftingSlots(from.craft, to.craft)) {
      return;
    }
    swapCraftingSlots(from.craft, to.craft);
    this.save(from.item, to.item);
    this.focusSwapButton(first.key);
  }

  /** "Ring 1 Blue": where a slot is, and its colour. */
  slotPhrase(row: CraftingSlotRow): string {
    return `${slotLabel(row.gearSlot)} ${swapColour(row)}`;
  }

  private save(...items: Item[]): void {
    for (const item of new Set(items)) {
      this.equipped.set(item);
    }
    this.rederive();
  }

  private offerUndo(swap: LastSwap): void {
    clearTimeout(this.undoTimer);
    this.lastSwap = swap;
    this.undoTimer = setTimeout(() => {
      this.lastSwap = null;
      this.changeDetector.markForCheck();
    }, UNDO_SWAP_MS);
  }

  private clearLastSwap(): void {
    clearTimeout(this.undoTimer);
    this.lastSwap = null;
  }

  private rowByKey(key: string): CraftingSlotRow | null {
    for (const group of this.overview.groups) {
      const row = group.rows.find(candidate => candidate.key === key);
      if (row) {
        return row;
      }
    }
    return null;
  }

  /** Which rows take the picked augment - dropping the pick if its slot has since emptied or gone. */
  private updateSwapTargets(): void {
    const source = this.swapSource;
    if (!source || !canStartCraftingSlotSwap(source.craft)) {
      this.swapSourceKey = null;
      this.swapTargetKeys = new Set();
      return;
    }
    this.swapTargetKeys = new Set(this.overview.groups
      .flatMap(group => group.rows)
      .filter(row => canSwapCraftingSlots(source.craft, row.craft))
      .map(row => row.key));
  }

  /** Keeps keyboard focus on the row it was working with once the buttons change under it. */
  private focusSwapButton(key: string): void {
    this.changeDetector.detectChanges();
    const row = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-row-key]'))
      .find(candidate => candidate.dataset['rowKey'] === key);
    row?.querySelector<HTMLElement>('.crafting-swap-button')?.focus({ preventScroll: true });
  }
}

/** "Blue", or the colour a flexible slot has been given. */
function swapColour(row: CraftingSlotRow): string {
  const system = isAugmentSystemName(row.craft.name) ? row.craft.name : row.craft.selectedCraftingSystemName;
  return system.replace(/ Augment Slot$/, '');
}
