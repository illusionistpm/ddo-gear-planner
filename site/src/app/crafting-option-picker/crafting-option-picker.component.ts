import {
  afterNextRender, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, Injector, Input,
  OnChanges, Output, ViewChild
} from '@angular/core';
import { NgbDropdown } from '@ng-bootstrap/ng-bootstrap';

import { CraftableOption } from '../gear/craftable-option';
import { CraftingOptionFamily, groupCraftingOptions } from '../gear/crafting-option-families';
import { AffixUiService } from '../affixes/affix-ui.service';
import { getStoredHideIrrelevantCraftingOptions, storeHideIrrelevantCraftingOptions } from '../planner/planner-view-state-storage';
import { buildFamilyRows, defaultTier, FamilyRow, TierRow } from './crafting-option-rows';

/** Lists shorter than this stay a native select; see gear-description. */
export const CRAFTING_PICKER_MIN_OPTIONS = 16;

/** One line of the popup list: a family, or one of the tiers of the family expanded under it. */
interface ListEntry {
  family: FamilyRow;
  tier?: TierRow;
}

let nextPickerId = 0;

/**
 * Picks an option from a long crafting list. The control shows the chosen
 * option; its popup lists one searchable entry per family of tiers (see
 * `groupCraftingOptions` and `buildFamilyRows`), coloured by its best tier,
 * and a family expands in place to list its tiers.
 *
 * The list is ranked against the build each time it opens, so it is only as
 * current as that - nothing it shows can change while it is open.
 */
@Component({
  selector: 'app-crafting-option-picker',
  templateUrl: './crafting-option-picker.component.html',
  styleUrls: ['./crafting-option-picker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class CraftingOptionPickerComponent implements OnChanges {
  @Input() options: CraftableOption[] = [];
  @Input() selected: CraftableOption | null = null;
  /** Rank class of the selected option, kept current by the parent as the build changes. */
  @Input() className = '';
  /** The item's slot, which ranking tooltips leave out of the competing sources. */
  @Input() slot?: string;
  /** Whether the item is the equipped one, so its chosen set augment already counts as a set piece. */
  @Input() itemIsEquipped = false;
  @Output() selectedChange = new EventEmitter<CraftableOption>();

  @ViewChild(NgbDropdown) dropdown?: NgbDropdown;
  @ViewChild('list') list?: ElementRef<HTMLElement>;
  @ViewChild('searchBox') searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild('toggle', { static: true }) toggleButton!: ElementRef<HTMLElement>;
  @ViewChild('menu', { static: true }) menu!: ElementRef<HTMLElement>;

  readonly id = `crafting-picker-${nextPickerId++}`;
  /** On touch screens the keyboard would cover half the list, so the search box waits to be tapped. */
  readonly focusSearchOnOpen = typeof window.matchMedia !== 'function' || window.matchMedia('(pointer: fine)').matches;

  isOpen = false;
  search = '';
  hideIrrelevant = getStoredHideIrrelevantCraftingOptions();
  families: FamilyRow[] = [];
  selectedFamily: FamilyRow | null = null;
  expandedFamily: FamilyRow | null = null;
  entries: ListEntry[] = [];
  activeIndex = 0;
  hiddenCount = 0;

  private groupedOptions: CraftableOption[] | null = null;
  private groups: CraftingOptionFamily[] = [];
  private visibleFamilies: FamilyRow[] = [];

  constructor(
    private affixUi: AffixUiService,
    private changeDetector: ChangeDetectorRef,
    private injector: Injector
  ) { }

  ngOnChanges() {
    if (this.isOpen) {
      this.loadList();
    }
  }

  get selectedLabel(): string {
    // Blank when nothing is chosen, as the native selects it stands in for are.
    return this.selected?.describe() ?? '';
  }

  get useStaticMenu(): boolean {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 575.98px)').matches;
  }

  entryId(index: number): string {
    return `${this.id}-entry-${index}`;
  }

  onOpenChange(open: boolean) {
    this.isOpen = open;
    if (open) {
      this.fitMenuToViewport();
      this.search = '';
      this.loadList();
      this.afterOpenRender();
    }
    this.changeDetector.markForCheck();
  }

  onSearchChange(search: string) {
    this.search = search;
    this.applyFilter();
  }

  onHideIrrelevantChange(hide: boolean) {
    this.hideIrrelevant = hide;
    storeHideIrrelevantCraftingOptions(hide);
    this.applyFilter();
  }

  onSearchKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      this.activeIndex = Math.min(Math.max(this.activeIndex + step, 0), this.entries.length - 1);
      this.scrollActiveIntoView();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const entry = this.entries[this.activeIndex];
      if (entry?.tier) {
        this.pickTier(entry.tier);
      } else if (entry) {
        this.activateFamily(entry.family);
      }
    }
  }

  /** A single option is picked outright; a family with tiers expands, or collapses, in place. */
  activateFamily(family: FamilyRow) {
    if (family.tiers.length === 1) {
      this.pickTier(family.tiers[0]);
      return;
    }
    this.expandedFamily = this.expandedFamily === family ? null : family;
    this.buildEntries();
    const target = this.expandedFamily ? defaultTier(family, this.selected) : null;
    this.activeIndex = Math.max(0, this.entries.findIndex(entry =>
      entry.family === family && (target ? entry.tier === target : !entry.tier)));
    this.scrollActiveIntoView();
    this.changeDetector.markForCheck();
  }

  pickTier(tier: TierRow) {
    this.dropdown?.close();
    if (tier.option !== this.selected) {
      this.selectedChange.emit(tier.option);
    }
  }

  /** Ranks the list against the build as it is now, and opens it at the selected option. */
  private loadList() {
    if (this.options !== this.groupedOptions) {
      this.groups = groupCraftingOptions(this.options);
      this.groupedOptions = this.options;
    }
    this.families = buildFamilyRows(this.groups,
      option => this.affixUi.rankCraftingOption(option, this.slot, this.itemIsEquipped && option === this.selected),
      this.affixUi);
    this.selectedFamily = this.families.find(family => family.tiers.some(tier => tier.option === this.selected)) ?? null;
    this.expandedFamily = this.selectedFamily && this.selectedFamily.tiers.length > 1 ? this.selectedFamily : null;
    this.applyFilter();
  }

  private applyFilter() {
    const term = this.search.trim().toLowerCase();
    const matching = term ? this.families.filter(family => family.searchText.includes(term)) : this.families;
    // With nothing in the list helping the build (say, no affixes tracked yet), hiding would leave it empty.
    const hide = this.hideIrrelevant && this.families.some(family => family.hideable && family.relevant);
    this.visibleFamilies = matching.filter(family => !hide || !family.hideable || family.relevant || family === this.selectedFamily);
    this.hiddenCount = matching.length - this.visibleFamilies.length;
    this.buildEntries();

    const selectedEntry = this.entries.findIndex(entry => entry.tier
      ? entry.tier.option === this.selected
      : entry.family === this.selectedFamily && entry.family !== this.expandedFamily);
    this.activeIndex = term ? 0 : Math.max(0, selectedEntry);
    this.changeDetector.markForCheck();
  }

  private buildEntries() {
    this.entries = this.visibleFamilies.flatMap(family => family === this.expandedFamily
      ? [{ family }, ...family.tiers.map(tier => ({ family, tier }))]
      : [{ family }]);
  }

  /**
   * Caps the menu to the room on whichever side of the toggle has more, so the dropdown's
   * placement can always find a side it fits on. Past the viewport it would lengthen the
   * page, and the page scrollbar that appears then shifts the whole layout.
   */
  private fitMenuToViewport() {
    const margin = 8;
    const minHeight = 160;
    const toggle = this.toggleButton.nativeElement.getBoundingClientRect();
    const room = Math.max(window.innerHeight - toggle.bottom, toggle.top) - 2 * margin;
    this.menu.nativeElement.style.setProperty('--crafting-picker-max-height', `${Math.max(room, minHeight)}px`);
  }

  private scrollActiveIntoView() {
    afterNextRender({
      read: () => {
        const active = this.list?.nativeElement.querySelector<HTMLElement>('.active');
        active?.scrollIntoView?.({ block: 'nearest' });
      }
    }, { injector: this.injector });
  }

  /**
   * The menu is created then moved into <body> by ngbDropdown, which blurs anything focused
   * on creation (so `appAutofocus` can't do this); focus once it has rendered in place.
   */
  private afterOpenRender() {
    this.scrollActiveIntoView();
    if (this.focusSearchOnOpen) {
      afterNextRender({ write: () => this.searchInput?.nativeElement.focus() }, { injector: this.injector });
    }
  }
}
