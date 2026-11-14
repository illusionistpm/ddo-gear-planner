import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, QueryList, ViewChildren
} from '@angular/core';
import { combineLatest, Subscription } from 'rxjs';

import { CraftingSlotControlComponent } from '../../crafting-slot-control/crafting-slot-control.component';
import { slotLabel } from '../../gear/slot-display';
import { EquippedService } from '../equipped.service';
import {
  CraftingSlotGroup, CraftingSlotOverview, CraftingSlotRow, CraftingSlotSummary, deriveCraftingSlotOverview
} from './crafting-slot-groups';

/**
 * Every crafting slot on the equipped gear, grouped by type - so you can see
 * you have four Sun slots, say, and fill them together. In the Equipment
 * panel in place of the gear cards (CraftingSlotsViewService), with the
 * same controls as a card's crafting rows.
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

  readonly slotLabel = slotLabel;
  overview: CraftingSlotOverview = { groups: [], summary: [] };
  onlyEmpty = false;
  private readonly collapsed = new Set<string>();
  private subscription?: Subscription;

  constructor(
    private readonly equipped: EquippedService,
    private readonly changeDetector: ChangeDetectorRef,
    private readonly host: ElementRef<HTMLElement>
  ) {}

  ngOnInit(): void {
    this.subscription = combineLatest(Array.from(this.equipped.getSlots().values())).subscribe(() => this.rederive());
  }

  private rederive(): void {
    this.overview = deriveCraftingSlotOverview(this.equipped.getSlotsSnapshot());
    // A change in one slot changes how options rank in the others, which keep their inputs.
    this.controls?.forEach(control => control.refresh());
    this.changeDetector.markForCheck();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
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
  }

  groupId(groupName: string): string {
    return 'crafting-group-' + groupName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
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
}
