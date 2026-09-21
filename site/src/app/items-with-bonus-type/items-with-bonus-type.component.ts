import { UserGearService, UserItemLocation } from '../planner/user-gear.service';
import { Component, OnInit, OnDestroy, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';

import { GearDbService, SetAffixMatch } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { ExternalAffixEntry } from '../affixes/external-affix';
import { Item } from '../gear/item';
import { Affix } from '../affixes/affix';
import { Craftable } from '../gear/craftable';

import { AffixService } from '../affixes/affix.service';
import { isCountAffix } from '../affixes/count-affix';
import { AffixAvailabilityService } from '../affixes/affix-availability.service';
import { CraftableOption } from '../gear/craftable-option';
import { AffixUiService } from '../affixes/affix-ui.service';
import { AnalyticsService } from '../shared/analytics.service';
import { perfAfterFrames, perfStart } from '../shared/perf-trace';
import { QuestService } from '../gear/quest.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { DrawerEquipService } from '../suggestion-drawer/drawer-equip.service';
import { ItemPreviewController } from '../item-preview/item-preview-controller';
import { isAugmentSystemName, isCraftingSlotAvailable } from '../gear/augment-slots';

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
      
      return Number(b.getValue(this.affixName, this.bonusType, this.affixSvc)) - 
             Number(a.getValue(this.affixName, this.bonusType, this.affixSvc));
    });
  }

  private updateSorting() {
    this.matches = this._sortItems(this.matches);
    this.lockedMatches = this._sortItems(this.lockedMatches);
  }

  @Input() affixName!: string;
  @Input() bonusType!: string;

  matches: Array<Item> = [];
  lockedMatches: Array<Item> = [];
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
  selectedCraftSlot?: CraftSlotChoice;

  sets: SetAffixMatch[] = [];
  unreachableSets: SetAffixMatch[] = [];
  private equippedSetCounts = new Map<string, number>();

  setMatches: Array<[string, Array<Affix>, Array<Item>]> = [];

  externalEntries: ExternalAffixEntry[] = [];

  private collapsedSections = new Set<string>();

  selectedAugmentSlot?: AugmentSlotChoice;
  /** The item list renders at most this many rows, and the preview carousel spans only those. */
  readonly maxRenderedItems = 100;
  readonly preview = new ItemPreviewController(item => {
    if (this.findMatchingValue(item)[0]) {
      item.selectMatchingBonusType(this.affixName, this.bonusType, this.affixSvc);
    }
  });
  private userItemsChangedSubscription?: Subscription;

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
    private changeDetector: ChangeDetectorRef
  ) {
  }

  ngOnDestroy() {
    this.userItemsChangedSubscription?.unsubscribe();
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
    if (this.affixName && this.bonusType) {
      this.refreshMatches();
    }
  }

  protected refreshMatches() {
    this.matches = [];
    this.lockedMatches = [];
    this.craftIntoEquippedGear = new Map<string, Map<Item, Array<Craftable>>>();
    this.craftIntoEquippedOptions = new Map<string, CraftableOption>();
    this.selectedCraftSlot = undefined;
    this.preview.close();

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

    this.externalEntries = this.equipped.getExternalAffixesForType(this.affixName, this.bonusType);
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
    return array.sort((a, b) =>
      Number(b.getValue(this.affixName, this.bonusType, this.affixSvc)) - Number(a.getValue(this.affixName, this.bonusType, this.affixSvc)));
  }

  findMatchingValue(item: Item) {
    const ret = item.getMatchingBonusType(this.affixName, this.bonusType, this.affixSvc);
    let crafting = (ret && ret[0]) || '';
    if (crafting) {
      crafting = ' (' + crafting + ')';
    }
    const value = (ret && ret[1]) || '';

    return [crafting, value];
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
      itemToEquip.selectMatchingBonusType(this.affixName, this.bonusType, this.affixSvc);
    }

    this.drawerEquip.equip(itemToEquip, 'bonus_type_modal');
    done({ slot: itemToEquip.slot, item: itemToEquip.name });
    perfAfterFrames('paint after bonus type equip');
  }

  equipAugment() {
    const done = perfStart('ItemsWithBonusTypeComponent.equipAugment');
    if (!this.selectedAugmentSlot) {
      done({ skipped: 'no selection' });
      return;
    }
    const { craftable, optionString, systemName } = this.selectedAugmentSlot;
    const item = new Item(this.selectedAugmentSlot.item);

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

  equipCraftIntoEquipped() {
    const done = perfStart('ItemsWithBonusTypeComponent.equipCraftIntoEquipped');
    if (!this.selectedCraftSlot) {
      done({ skipped: 'no selection' });
      return;
    }
    const { craftable, optionString } = this.selectedCraftSlot;
    const item = new Item(this.selectedCraftSlot.item);

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
