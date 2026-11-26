import { UserGearService, UserItemLocation } from '../planner/user-gear.service';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { merge, Subscription } from 'rxjs';

import { GearDbService, SetAffixMatch } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { ExternalAffixEntry } from '../affixes/external-affix';
import { Item } from '../gear/item';
import { Affix } from '../affixes/affix';
import { Craftable, CraftableOptionFilter } from '../gear/craftable';

import { AffixService } from '../affixes/affix.service';
import { isCountAffix } from '../affixes/count-affix';
import { AffixAvailabilityService } from '../affixes/affix-availability.service';
import { CraftableOption } from '../gear/craftable-option';
import { AffixUiService } from '../affixes/affix-ui.service';
import { AnalyticsService } from '../shared/analytics.service';
import { preserveScrollOnMouseDown } from '../shared/preserve-scroll-position';
import { perfAfterFrames, perfStart } from '../shared/perf-trace';
import { QuestService } from '../gear/quest.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { DrawerEquipService } from '../suggestion-drawer/drawer-equip.service';
import { ItemPreviewController } from '../item-preview/item-preview-controller';
import { PreviewCarousel } from '../item-preview/preview-carousel';
import { FiligreeSetPreviewEntry } from '../filigree-set-preview/filigree-set-preview.component';
import { isAugmentSystemName, isCraftingSlotAvailable } from '../gear/augment-slots';
import { isOptionHiddenByPacks } from '../gear/pack-filter';
import { FiligreeAffixMatch, FiligreeDbService, FiligreeSetAffixMatch } from '../gear/filigree-db.service';
import { FILIGREE_HOST_TEXT, FILIGREE_HOSTS, FiligreeHost } from '../gear/filigree';
import { FiligreeLoadoutService } from '../planner/filigree-loadout.service';
import { ITEM_BONUS_KINDS, ItemBonusKind } from '../gear/item-bonus';
import { ItemBonusService } from '../gear/item-bonus.service';
import { ITEM_BONUS_TYPE_BY_KIND } from '../affixes/item-bonus-types';
import { ITEM_BONUS_KIND_LABELS } from '../planner/item-bonus-settings.service';
import { slotLabel } from '../gear/slot-display';
import { FilterSheetService } from '../planner/filter-sheet.service';

/** An equipped item and the Mythic Boost, Reaper bonus or Curse its slot offers that gives most of this affix and type. */
interface ItemBonusMatch {
  slot: string;
  slotLabel: string;
  itemName: string;
  option: CraftableOption;
  value: number;
  /** The name of the bonus of this kind the item already carries, which keeps it out of the list; '' if none. */
  carried: string;
}

/** An open augment slot on an equipped item that could take the chosen augment. */
interface AugmentSlotChoice {
  item: Item;
  craftable: Craftable;
  systemName: string;
  optionString: string;
}

/** An open crafting slot on an equipped item that could take the chosen option. */
interface CraftSlotChoice {
  item: Item;
  craftable: Craftable;
  optionString: string;
}

/** Hidden matches are told apart by name and slot: the preview and Equip work on copies. */
const hiddenMatchKey = (item: Item) => item.name + '|' + item.slot;

/** How many item rows a list shows before "Show all": a long list is slow to render and rarely read to the end. */
const ITEM_ROW_LIMIT = 50;

@Component({
    selector: 'app-items-with-bonus-type',
    templateUrl: './items-with-bonus-type.component.html',
    styleUrls: ['./items-with-bonus-type.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ItemsWithBonusTypeComponent implements OnInit, OnDestroy, OnChanges {
  @Input() sortOwnedToTop: boolean = true;

  ngOnChanges(changes: SimpleChanges) {
    if ((changes['affixName'] || changes['bonusType']) && this.affixName && this.bonusType) {
      this.refreshMatches();
      return;
    }

    if (changes['sortOwnedToTop'] && !changes['sortOwnedToTop'].firstChange) {
      this.updateSorting();
    }
  }

  private _sortItems(items: Item[]): Item[] {
    const userOwnsItem = (item: Item) => this.userGear.hasItem(item.name);
    return [...items].sort((a, b) => {
      if (this.sortOwnedToTop) {
        if (userOwnsItem(a) && !userOwnsItem(b)) {
          return -1; // a is owned, b is not, a comes first
        } else if (!userOwnsItem(a) && userOwnsItem(b)) {
          return 1; // b is owned, a is not, b comes first
        }
      }
      
      return this.itemValue(b) - this.itemValue(a);
    });
  }

  /**
   * An item's value for this bonus type, and the crafting option that gives it: worked
   * out once per refresh. Each is a walk over the item's crafting options, and they were
   * asked for on every comparison of a sort and twice per row on every change detection
   * pass - most of the time it took a long list (200 rows) to open.
   */
  private valueCache = new Map<Item, number>();
  private matchCache = new Map<Item, [string, string | number]>();

  private itemValue(item: Item): number {
    let value = this.valueCache.get(item);
    if (value === undefined) {
      value = Number(item.getValue(this.affixName, this.bonusType, this.affixSvc, this.craftingOptionFilter(item)));
      this.valueCache.set(item, value);
    }
    return value;
  }

  private updateSorting() {
    this.matches = this._sortItems(this.matches);
    this.lockedMatches = this._sortItems(this.lockedMatches);
    this.hiddenMatches = this._sortItems(this.hiddenMatches);
  }

  @Input() affixName!: string;
  @Input() bonusType!: string;

  matches: Array<Item> = [];
  lockedMatches: Array<Item> = [];
  /** Items the item filters hide (an item, or the crafting option that gives it this), behind a button. */
  hiddenMatches: Array<Item> = [];
  showHiddenMatches = false;
  private hiddenMatchKeys = new Set<string>();
  /** Locked items whose slot is free: only the one-Minor-Artifact limit rules them out. */
  artifactLimited = new Set<Item>();

  optionToEligibleGear: Map<string, Map<Item, Array<{ craftable: Craftable, systemName: string }>>> =
    new Map<string, Map<Item, Array<{ craftable: Craftable, systemName: string }>>>();
  stringToOption: Map<string, CraftableOption> = new Map<string, CraftableOption>();

  // Free non-augment crafting slots on already-equipped items (e.g. an equipped
  // Legendary Green Steel piece with T1 filled but T2/T3 still open) that could
  // still host this bonus type. Modelled like the augment list above: an option
  // string maps to the equipped items (and their open tiers) it could go into.
  craftIntoEquippedGear: Map<string, Map<Item, Array<Craftable>>> = new Map<string, Map<Item, Array<Craftable>>>();
  craftIntoEquippedOptions: Map<string, CraftableOption> = new Map<string, CraftableOption>();
  /**
   * Per option row: the slots it could go into, and the one picked (the first,
   * until another is chosen), so every row's Equip works without a visit to
   * its dropdown. Built once per refresh - the dropdown matches by identity.
   */
  augmentChoices = new Map<string, AugmentSlotChoice[]>();
  augmentPicks = new Map<string, AugmentSlotChoice>();
  craftChoices = new Map<string, CraftSlotChoice[]>();
  craftPicks = new Map<string, CraftSlotChoice>();

  sets: SetAffixMatch[] = [];
  unreachableSets: SetAffixMatch[] = [];
  private equippedSetCounts = new Map<string, number>();

  setMatches: Array<[string, Array<Affix>, Array<Item>]> = [];

  externalEntries: ExternalAffixEntry[] = [];

  /** Filigrees whose own bonuses give this affix and type, best first. */
  filigreeMatches: FiligreeAffixMatch[] = [];
  /** Filigree sets whose bonuses give it. */
  filigreeSetMatches: FiligreeSetAffixMatch[] = [];
  readonly filigreeHosts = FILIGREE_HOSTS;
  readonly filigreeHostText = FILIGREE_HOST_TEXT;

  /** Set when the bonus type is one only a player's copy of an item carries: the kind, and where it can go. */
  itemBonusKind: ItemBonusKind | null = null;
  itemBonusLabel = '';
  /** Equipped items with no bonus of the kind yet, which can be given one here. */
  itemBonusMatches: ItemBonusMatch[] = [];
  /** Equipped items that already carry a bonus of the kind: excluded by equipment, as a filled slot's items are. */
  lockedItemBonusMatches: ItemBonusMatch[] = [];

  private collapsedSections = new Set<string>();

  /** The item lists render at most this many rows, and the preview carousel spans only those, until Show all. */
  maxRenderedItems = ITEM_ROW_LIMIT;

  /** Rows of `list` the limit is holding back. */
  rowsNotShown(list: Item[]): number {
    return Math.max(0, list.length - this.maxRenderedItems);
  }

  showAllItems() {
    this.maxRenderedItems = Infinity;
  }
  readonly preview = new ItemPreviewController(item => {
    if (this.findMatchingValue(item)[0]) {
      item.selectMatchingBonusType(this.affixName, this.bonusType, this.affixSvc, this.craftingOptionFilter(item));
    }
  });
  /**
   * The filigree set shown beside the drawer, stepping through the rows of the list it was opened
   * from (sets or filigrees); only one of it and the item preview shows at once.
   */
  readonly filigreeSetPreview = new PreviewCarousel<FiligreeSetPreviewEntry>();
  private userItemsChangedSubscription?: Subscription;
  private equippedSlotsSubscription?: Subscription;

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private affixSvc: AffixService,
    private availability: AffixAvailabilityService,
    public userGear: UserGearService,
    public affixUi: AffixUiService,
    private analytics: AnalyticsService,
    private questService: QuestService,
    private suggestionDrawer: SuggestionDrawerService,
    private drawerEquip: DrawerEquipService,
    private changeDetector: ChangeDetectorRef,
    private filigreeDb: FiligreeDbService,
    public filigree: FiligreeLoadoutService,
    private itemBonuses: ItemBonusService,
    private filterSheet: FilterSheetService
  ) {
  }

  openFilters() {
    this.filterSheet.open();
  }

  ngOnDestroy() {
    this.userItemsChangedSubscription?.unsubscribe();
    this.equippedSlotsSubscription?.unsubscribe();
  }

  userOwnsItem(item: Item): boolean {
    return !!item?.name && this.userGear.hasItem(item.name);
  }

  getUserItemLocations(item: Item): UserItemLocation[] | undefined {
    return item?.name ? this.userGear.getItemLocations(item.name) : undefined;
  }

  isRaidLoot(item: Item): boolean {
    return this.questService.isRaidLoot(item);
  }

  ngOnInit() {
    this.userItemsChangedSubscription = this.userGear.userItemsChanged$.subscribe(() => {
      this.updateSorting();
      this.changeDetector.markForCheck();
    });
    // A Mythic, Reaper or Curse list is of the equipped gear itself, so it follows every change to it,
    // including one the drawer didn't make (the card, or the browser's back button restoring a build).
    this.equippedSlotsSubscription = merge(...this.equipped.getSlots().values()).subscribe(() => {
      if (this.itemBonusKind) {
        this.refreshItemBonusMatches();
        this.changeDetector.markForCheck();
      }
    });
    if (this.affixName && this.bonusType) {
      this.refreshMatches();
    }
  }

  protected refreshMatches() {
    this.valueCache = new Map();
    this.matchCache = new Map();
    this.matches = [];
    this.lockedMatches = [];
    this.hiddenMatches = [];
    this.hiddenMatchKeys = new Set<string>();
    this.showHiddenMatches = false;
    this.craftIntoEquippedGear = new Map<string, Map<Item, Array<Craftable>>>();
    this.craftIntoEquippedOptions = new Map<string, CraftableOption>();
    this.preview.close();
    this.maxRenderedItems = ITEM_ROW_LIMIT;

    const matchingGear = this.equipped.getCompatibleGear(
      this.gearDB.findGearWithAffixAndType(this.affixName, this.bonusType)
    );
    const unlocked: Item[] = [];
    const locked: Item[] = [];
    const unlockedSlots = this.equipped.getUnlockedSlots();
    this.artifactLimited = new Set<Item>();
    for (const item of matchingGear) {
      if (!unlockedSlots.has(item.slot)) {
        locked.push(item);
      } else if (this.equipped.isBlockedByArtifactLimit(item)) {
        // Its slot is free, so the artifact limit is the only thing keeping it out.
        this.artifactLimited.add(item);
        locked.push(item);
      } else {
        unlocked.push(item);
      }
    }
    // Sort both lists by value and ownership
    this.matches = this._sortItems(unlocked);
    this.lockedMatches = this._sortItems(locked);

    if (!this.gearDB.itemFiltersHideNothing()) {
      const shown = new Set(matchingGear.map(hiddenMatchKey));
      const hidden = this.equipped.getCompatibleGear(
        this.gearDB.findGearWithAffixAndType(this.affixName, this.bonusType, { ignoreFilters: true })
      ).filter(item => !shown.has(hiddenMatchKey(item)));
      this.hiddenMatchKeys = new Set(hidden.map(hiddenMatchKey));
      this.hiddenMatches = this._sortItems(hidden);
    }

    // This is a map of, e.g., Diamond of Str 14 -> Boots Of Innocence -> [Blue Augment, Colorless Augment]
    // This allows me to build a list that looks something like
    // ML | Diamond of Strength +14 | ComboBox of Eligible Item/Slot combinations | 14 | Equip button
    // I feel like I've overcomplicated this, but it works.
    this.optionToEligibleGear = new Map<string, Map<Item, Array<{ craftable: Craftable, systemName: string }>>>();
    this.stringToOption = new Map<string, CraftableOption>();
    
    const matchingAugments = this.gearDB.findAugmentsWithAffixAndType(this.affixName, this.bonusType);
    matchingAugments.forEach((matchingAugmentCraftable) => {
      for (const option of matchingAugmentCraftable.options) {

        if (!this.optionToEligibleGear.has(option.describe())) {
          this.stringToOption.set(option.describe(), option);
        }

        if (!this.optionToEligibleGear.has(option.describe())) {
          this.optionToEligibleGear.set(option.describe(), new Map<Item, Array<{ craftable: Craftable, systemName: string }>>());
        }

        for (const item of this.equipped.getSlotsSnapshot().values()) {
          if (!item || !item.crafting) {
            continue;
          }

          for (const craftable of item.crafting) {
            if (craftable.selected.affixes.length != 0) {
              // This craftable is already committed to something; skip it.
              continue;
            }

            if (!isCraftingSlotAvailable(item, craftable)) {
              continue;
            }

            const canUseCraftable = matchingAugmentCraftable.name == craftable.name
              || (
                craftable.hasCraftingSystemOptions()
                && craftable.craftingSystemOptions.includes(matchingAugmentCraftable.name)
                && (!craftable.selectedCraftingSystemName || craftable.selectedCraftingSystemName === matchingAugmentCraftable.name)
              );

            if (canUseCraftable) {
              const eligibleGearMap = this.optionToEligibleGear.get(option.describe());
              if (eligibleGearMap) {
                if (!eligibleGearMap.has(item)) {
                  eligibleGearMap.set(item, []);
                }
                const gearCraftables = eligibleGearMap.get(item);
                if (gearCraftables) {
                  gearCraftables.push({ craftable, systemName: matchingAugmentCraftable.name });
                }
              }
            }
          }
        }
      }
    });
        
    // Free non-augment crafting slots on equipped items. The augment scan above
    // fills open augment slots on equipped gear; this does the same for plain
    // option-list crafting tiers (Legendary Green Steel T1/T2/T3, etc.) so a
    // partly-crafted piece still offers its remaining tiers.
    const maxLevel = this.gearDB.getMaxLevelFilter();
    const hiddenPacks = this.gearDB.getHiddenPacks();
    for (const item of this.equipped.getSlotsSnapshot().values()) {
      if (!item || !item.crafting) {
        continue;
      }

      for (const craftable of item.crafting) {
        if (craftable.selected.affixes.length != 0) {
          continue; // tier already committed to something
        }
        if (isAugmentSystemName(craftable.name) || craftable.hasCraftingSystemOptions()) {
          continue; // augment slots are handled by the scan above
        }

        for (const option of craftable.options) {
          if (!option.isWithinMaxLevel(maxLevel) || isOptionHiddenByPacks(option, hiddenPacks)
            || !item.isOptionAllowed(option)) {
            continue;
          }
          if (option.getMatchingBonusType(this.affixName, this.bonusType, this.affixSvc) == null) {
            continue;
          }

          const key = option.describe();
          if (!this.craftIntoEquippedOptions.has(key)) {
            this.craftIntoEquippedOptions.set(key, option);
            this.craftIntoEquippedGear.set(key, new Map<Item, Array<Craftable>>());
          }

          const gearMap = this.craftIntoEquippedGear.get(key);
          if (gearMap) {
            if (!gearMap.has(item)) {
              gearMap.set(item, []);
            }
            gearMap.get(item)?.push(craftable);
          }
        }
      }
    }

    this.buildSlotChoices();

    // JAK: FIXME!! I need to add sets to the bonus type list
    // Split by whether the set can still reach its piece threshold given the
    // slots left open, the same way gear is split into open vs filled slots.
    const openSlots = this.equipped.getUnlockedSlots();
    this.equippedSetCounts = this.equipped.getActiveSets();
    this.sets = [];
    this.unreachableSets = [];
    for (const set of this.gearDB.findSetsWithAffixAndType(this.affixName, this.bonusType)) {
      if (this.availability.isSetReachable(set[0], set[1], openSlots, this.equippedSetCounts)) {
        this.sets.push(set);
      } else {
        this.unreachableSets.push(set);
      }
    }
    this.sets = this._sortSetsByValue(this.sets);
    this.unreachableSets = this._sortSetsByValue(this.unreachableSets);

    this.matches = this._sortByValue(this.matches);
    this.lockedMatches = this._sortByValue(this.lockedMatches);
    this.hiddenMatches = this._sortByValue(this.hiddenMatches);

    this.externalEntries = this.equipped.getExternalAffixesForType(this.affixName, this.bonusType);

    // Mostly filigrees' own bonus types, but a few effects are an ordinary type (Snowpeak's Gifts'
    // Enhancement Movement Speed), so every type looks.
    const flatten = (affixes: Affix[]) => this.affixSvc.flattenAffixGroups(affixes, true);
    this.filigreeMatches = this.filigreeDb.findFiligreesWithAffixAndType(this.affixName, this.bonusType, flatten);
    this.filigreeSetMatches = this.filigreeDb.findSetsWithAffixAndType(this.affixName, this.bonusType, flatten);

    this.refreshItemBonusMatches();
  }

  /**
   * A Mythic, Reaper or Fortune bonus comes from no item in game data: it is set on the gear already
   * equipped. So the drawer lists that gear, each piece with the option its slot offers that gives the
   * most, ready to set from here.
   */
  private refreshItemBonusMatches() {
    const kind = ITEM_BONUS_KINDS.find(each => ITEM_BONUS_TYPE_BY_KIND[each] === this.bonusType) ?? null;
    this.itemBonusKind = kind;
    this.itemBonusLabel = kind ? ITEM_BONUS_KIND_LABELS[kind] : '';
    this.itemBonusMatches = [];
    this.lockedItemBonusMatches = [];
    if (!kind) {
      return;
    }
    for (const [slot, item] of this.equipped.getSlotsSnapshot()) {
      if (!item) {
        continue;
      }
      let best: CraftableOption | undefined;
      let bestValue = 0;
      for (const option of this.itemBonuses.getOptions(kind, slot)) {
        const value = Number(option.getMatchingBonusType(this.affixName, this.bonusType, this.affixSvc) ?? 0);
        if (value > bestValue) {
          best = option;
          bestValue = value;
        }
      }
      if (!best) {
        continue;
      }
      const carried = item.bonuses[kind];
      // Like an item for a filled slot: one already carrying a bonus of this kind is listed as excluded.
      (carried ? this.lockedItemBonusMatches : this.itemBonusMatches).push({
        slot,
        slotLabel: slotLabel(slot),
        itemName: item.name,
        option: best,
        value: bestValue,
        carried: carried?.name ?? '',
      });
    }
  }

  setItemBonus(match: ItemBonusMatch) {
    if (!this.itemBonusKind) {
      return;
    }
    this.equipped.setItemBonus(match.slot, this.itemBonusKind, match.option);
    this.analytics.track('set_item_bonus_from_bonus_type', { kind: this.itemBonusKind, slot: match.slot });
  }

  showItemPreview(item: Item, items: Item[], index: number) {
    this.filigreeSetPreview.close();
    this.preview.show(item, items, index);
  }

  showFiligreeSet(index: number) {
    this.preview.close();
    this.filigreeSetPreview.show(this.filigreeSetMatches.map(match => ({ sets: [match.set], filigree: null })), index);
    this.analytics.track('open_filigree_set', { source: 'bonus_type' });
  }

  /** Opens a listed filigree's set (both, for a raid filigree), stepping through the listed filigrees. */
  showFiligreeSetOf(name: string) {
    const index = this.filigreeMatches.findIndex(match => match.name === name);
    if (index < 0) {
      return;
    }
    this.preview.close();
    this.filigreeSetPreview.show(this.filigreeMatches.map(match => ({ sets: match.sets, filigree: match.name })), index);
    this.analytics.track('open_filigree_set', { source: 'bonus_type_filigree' });
  }

  isPreviewedFiligree(name: string): boolean {
    return this.filigreeSetPreview.current?.filigree === name;
  }

  isPreviewedFiligreeSet(set: string): boolean {
    const current = this.filigreeSetPreview.current;
    return !!current && current.filigree === null && current.sets[0] === set;
  }

  /**
   * Adds the filigree after the host's last one. Not a second copy into one host: allowed on the
   * gear card, as a set piece, but it would add nothing to this bonus.
   */
  slotFiligree(name: string, host: FiligreeHost) {
    if (!this.filigree.append(host, { name, rare: false })) {
      return;
    }
    this.analytics.track('slot_filigree_from_bonus_type', { host });
    this.refreshMatches();
  }

  toggleSection(key: string) {
    if (this.collapsedSections.has(key)) {
      this.collapsedSections.delete(key);
    } else {
      this.collapsedSections.add(key);
    }
  }

  isSectionCollapsed(key: string): boolean {
    return this.collapsedSections.has(key);
  }

  removeExternal(id: string, event?: Event) {
    event?.stopPropagation();
    this.equipped.removeExternalAffix(id);
    this.refreshMatches();
  }

  readonly preserveScrollOnMouseDown = preserveScrollOnMouseDown;

  private _sortSetsByValue(sets: SetAffixMatch[]): SetAffixMatch[] {
    return [...sets].sort((a, b) =>
      b[2] - a[2] ||
      a[0].localeCompare(b[0]));
  }

  isRealType(bonusType: string) {
    return Affix.isRealType(bonusType);
  }

  /** A count affix (Max Filigree Slots) has a placeholder bonus type that isn't worth showing. */
  showsBonusType() {
    return this.isRealType(this.bonusType) && !isCountAffix(this.affixName);
  }

  /** Non-gear sources add bonuses; a count of filigree slots can't come from a spell or trance. */
  allowsNonGearSource() {
    return !isCountAffix(this.affixName);
  }

  _sortByValue(array: Array<Item>) {
    return array.sort((a, b) => this.itemValue(b) - this.itemValue(a));
  }

  /**
   * The crafting options the list may suggest: those the level and pack filters let
   * through, the same ones findGearWithAffixAndType counted when it listed the item -
   * or, for an item listed as hidden by the filters, any.
   */
  private craftingOptionFilter(item: Item): CraftableOptionFilter {
    if (this.hiddenMatchKeys.has(hiddenMatchKey(item))) {
      // Listed because the filters hide it, often for this very option: take it at any ML or pack.
      return () => true;
    }
    const maxLevel = this.gearDB.getMaxLevelFilter();
    const hiddenPacks = this.gearDB.getHiddenPacks();
    return option => option.isWithinMaxLevel(maxLevel) && !isOptionHiddenByPacks(option, hiddenPacks);
  }

  findMatchingValue(item: Item): [string, string | number] {
    const cached = this.matchCache.get(item);
    if (cached) {
      return cached;
    }
    const ret = item.getMatchingBonusType(this.affixName, this.bonusType, this.affixSvc, false, this.craftingOptionFilter(item));
    let crafting = (ret && ret[0]) || '';
    if (crafting) {
      crafting = ' (' + crafting + ')';
    }
    const value = (ret && ret[1]) || '';

    const match: [string, string | number] = [crafting, value];
    // Only the list's own items: an item being equipped is a copy, and its crafting changes.
    if (this.valueCache.has(item)) {
      this.matchCache.set(item, match);
    }
    return match;
  }

  equipPreviewItem(item: Item) {
    if (!this.equipped.canEquip(item)) {
      return;
    }

    const done = perfStart('ItemsWithBonusTypeComponent.equipPreviewItem');
    const itemToEquip = new Item(item);
    this.drawerEquip.equip(itemToEquip, 'bonus_type_preview');
    done({ slot: itemToEquip.slot, item: itemToEquip.name });
    perfAfterFrames('paint after bonus type preview equip');
  }

  equipItem(item: Item) {
    if (!this.equipped.canEquip(item)) {
      return;
    }

    const done = perfStart('ItemsWithBonusTypeComponent.equipItem');
    const itemToEquip = new Item(item);
    // Apply the relevant crafting option, if any
    if (this.findMatchingValue(itemToEquip)[0]) {
      itemToEquip.selectMatchingBonusType(this.affixName, this.bonusType, this.affixSvc, this.craftingOptionFilter(itemToEquip));
    }

    this.drawerEquip.equip(itemToEquip, 'bonus_type_modal');
    done({ slot: itemToEquip.slot, item: itemToEquip.name });
    perfAfterFrames('paint after bonus type equip');
  }

  /** An augment fills an empty slot, so it is ranked as added to the build, replacing nothing. */
  getAugmentClass(option: CraftableOption): string {
    return this.affixUi.getClassForAffix(option.affixes[0], undefined, this.affixUi.candidateForAddedOption(option));
  }

  private buildSlotChoices() {
    this.augmentChoices = new Map();
    this.augmentPicks = new Map();
    for (const [optionString, gear] of this.optionToEligibleGear) {
      const choices: AugmentSlotChoice[] = [];
      for (const [item, entries] of gear) {
        for (const entry of entries) {
          choices.push({ item, craftable: entry.craftable, systemName: entry.systemName, optionString });
        }
      }
      this.augmentChoices.set(optionString, choices);
      if (choices.length) {
        this.augmentPicks.set(optionString, choices[0]);
      }
    }

    this.craftChoices = new Map();
    this.craftPicks = new Map();
    for (const [optionString, gear] of this.craftIntoEquippedGear) {
      const choices: CraftSlotChoice[] = [];
      for (const [item, craftables] of gear) {
        for (const craftable of craftables) {
          choices.push({ item, craftable, optionString });
        }
      }
      this.craftChoices.set(optionString, choices);
      if (choices.length) {
        this.craftPicks.set(optionString, choices[0]);
      }
    }
  }

  /**
   * "Weapon: Red Augment Slot" - which gear slot, and the crafting slot on it by the
   * name the rest of the planner uses, without the item's name, which made each option
   * a line of text. The title still names the item.
   */
  slotChoiceLabel(choice: { item: Item, craftable: Craftable }): string {
    return `${slotLabel(choice.item.slot)}: ${choice.craftable.name}`;
  }

  slotChoiceTitle(choice: { item: Item, craftable: Craftable }): string {
    return `${choice.item.name} - ${choice.craftable.name}`;
  }

  equipAugment(optionKey: string) {
    const done = perfStart('ItemsWithBonusTypeComponent.equipAugment');
    const pick = this.augmentPicks.get(optionKey);
    if (!pick) {
      done({ skipped: 'no selection' });
      return;
    }
    const { craftable, optionString, systemName } = pick;
    const item = new Item(pick.item);

    for (const itemCraftable of item.crafting) {
      if (itemCraftable.name == craftable.name) {
        if (systemName && itemCraftable.hasCraftingSystemOptions()) {
          itemCraftable.selectCraftingSystem(systemName);
        }

        for (const option of itemCraftable.options) {
          if (option.describe() == optionString) {
            itemCraftable.selected = option;
            this.drawerEquip.equip(item, 'augment_modal');
            done({ slot: item.slot, item: item.name });
            perfAfterFrames('paint after augment equip');
            return;
          }
        }
      }
    }

    console.error('Unable to find matching option for ' + item.name + ' ' + craftable.name + ' ' + optionString);
    done({ error: true });
  }

  /** Value the tracked (affix, bonus type) takes in the given craft option. */
  craftOptionMatchValue(optionString: string): number | string {
    const option = this.craftIntoEquippedOptions.get(optionString);
    const value = option?.getMatchingBonusType(this.affixName, this.bonusType, this.affixSvc);
    return value == null ? '' : value;
  }

  equipCraftIntoEquipped(optionKey: string) {
    const done = perfStart('ItemsWithBonusTypeComponent.equipCraftIntoEquipped');
    const pick = this.craftPicks.get(optionKey);
    if (!pick) {
      done({ skipped: 'no selection' });
      return;
    }
    const { craftable, optionString } = pick;
    const item = new Item(pick.item);

    for (const itemCraftable of item.crafting) {
      if (itemCraftable.name == craftable.name) {
        for (const option of itemCraftable.options) {
          if (option.describe() == optionString) {
            itemCraftable.selected = option;
            this.drawerEquip.equip(item, 'bonus_type_craft_into_equipped');
            done({ slot: item.slot, item: item.name, craftable: craftable.name });
            perfAfterFrames('paint after bonus type craft-into-equipped');
            return;
          }
        }
      }
    }

    console.error('Unable to find matching option for ' + item.name + ' ' + craftable.name + ' ' + optionString);
    done({ error: true });
  }

  // Duplicated from gear-craftingList
  showItemsInSet(setName: string) {
    this.analytics.track('open_set_items', {
      source: 'bonus_type_modal'
    });
    this.suggestionDrawer.openSet(setName);
  }

  equippedPiecesForSet(setName: string): number {
    return this.equippedSetCounts.get(setName) || 0;
  }

  get canGoBack(): boolean {
    return this.suggestionDrawer.canGoBack;
  }

  goBack() {
    this.suggestionDrawer.back();
  }

  close() {
    this.suggestionDrawer.close();
  }

}
