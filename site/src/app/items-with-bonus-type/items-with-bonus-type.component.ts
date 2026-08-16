import { UserGearService, UserItemLocation } from '../user-gear.service';
import { Component, OnInit, Input, OnChanges, SimpleChanges, ChangeDetectionStrategy } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { Affix } from '../affix';
import { Craftable } from '../craftable';

import { ItemsInSetComponent } from './../items-in-set/items-in-set.component';
import { AffixService } from '../affix.service';
import { CraftableOption } from '../craftable-option';
import { AffixUiService } from '../affix-ui.service';
import { AnalyticsService } from '../analytics.service';
import { perfAfterFrames, perfStart } from '../perf-trace';

@Component({
    selector: 'app-items-with-bonus-type',
    templateUrl: './items-with-bonus-type.component.html',
    styleUrls: ['./items-with-bonus-type.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ItemsWithBonusTypeComponent implements OnInit, OnChanges {
  @Input() sortOwnedToTop: boolean = true;

  ngOnChanges(changes: SimpleChanges) {
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

  matches!: Array<Item>;
  lockedMatches!: Array<Item>;

  optionToEligibleGear!: Map<string, Map<Item, Array<Craftable>>>;
  stringToOption!: Map<string, CraftableOption>;

  sets!: Array<[string, number, number]>;

  setMatches!: Array<[string, Array<Affix>, Array<Item>]>;

  selectedAugmentSlot: any;

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private modalService: NgbModal,
    private affixSvc: AffixService,
    public userGear: UserGearService,
    public affixUi: AffixUiService,
    private analytics: AnalyticsService
  ) {
  }

  userOwnsItem(item: Item): boolean {
    return !!item?.name && this.userGear.hasItem(item.name);
  }

  getUserItemLocations(item: Item): UserItemLocation[] | undefined {
    return item?.name ? this.userGear.getItemLocations(item.name) : undefined;
  }

  ngOnInit() {
    this.matches = [];
    this.lockedMatches = [];

    const matchingGear = this.gearDB.findGearWithAffixAndType(this.affixName, this.bonusType);
    const userOwnsItem = (item: Item) => this.userGear.hasItem(item.name);
    const unlocked: Item[] = [];
    const locked: Item[] = [];
    for (const item of matchingGear) {
      if (this.equipped.getUnlockedSlots().has(item.slot)) {
        unlocked.push(item);
      } else {
        locked.push(item);
      }
    }
    // Sort both lists by value and ownership
    this.matches = this._sortItems(unlocked);
    this.lockedMatches = this._sortItems(locked);

    // This is a map of, e.g., Diamond of Str 14 -> Boots Of Innocence -> [Blue Augment, Colorless Augment]
    // This allows me to build a list that looks something like
    // ML | Diamond of Strength +14 | ComboBox of Eligible Item/Slot combinations | 14 | Equip button
    // I feel like I've overcomplicated this, but it works.
    this.optionToEligibleGear = new Map<string, Map<Item, Array<Craftable>>>();
    this.stringToOption = new Map<string, CraftableOption>();
    
    const matchingAugments = this.gearDB.findAugmentsWithAffixAndType(this.affixName, this.bonusType);
    matchingAugments.forEach((matchingAugmentCraftable) => {
      for (const option of matchingAugmentCraftable.options) {

        if (!this.optionToEligibleGear.has(option.describe())) {
          this.stringToOption.set(option.describe(), option);
        }

        if (!this.optionToEligibleGear.has(option.describe())) {
          this.optionToEligibleGear.set(option.describe(), new Map<Item, Array<Craftable>>());
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
            if (matchingAugmentCraftable.name == craftable.name) {
              const eligibleGearMap = this.optionToEligibleGear.get(option.describe());
              if (eligibleGearMap) {
                if (!eligibleGearMap.has(item)) {
                  eligibleGearMap.set(item, []);
                }
                const gearCraftables = eligibleGearMap.get(item);
                if (gearCraftables) {
                  gearCraftables.push(matchingAugmentCraftable);
                }
              }
            }
          }
        }
      }
    });
        
    // JAK: FIXME!! I need to add sets to the bonus type list
    this.sets = this.gearDB.findSetsWithAffixAndType(this.affixName, this.bonusType);

    this.matches = this._sortByValue(this.matches);
    this.lockedMatches = this._sortByValue(this.lockedMatches);
  }

  isRealType(bonusType: string) {
    return Affix.isRealType(bonusType);
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

  equipItem(item: Item) {
    const done = perfStart('ItemsWithBonusTypeComponent.equipItem');
    const itemToEquip = new Item(item);
    // Apply the relevant crafting option, if any
    if (this.findMatchingValue(itemToEquip)[0]) {
      itemToEquip.selectMatchingBonusType(this.affixName, this.bonusType, this.affixSvc);
    }

    this.equipped.set(itemToEquip);
    this.analytics.track('planner_equip_item', {
      equip_source: 'bonus_type_modal',
      slot: itemToEquip.slot,
      crafted: !!itemToEquip.isEssenceCrafted()
    });
    this.modalService.dismissAll();
    done({ slot: itemToEquip.slot, item: itemToEquip.name });
    perfAfterFrames('paint after bonus type equip');
  }

  equipAugment() {
    const done = perfStart('ItemsWithBonusTypeComponent.equipAugment');
    const item = new Item(this.selectedAugmentSlot.item as Item);
    const craftable = this.selectedAugmentSlot.craftable as Craftable;
    const optionString = this.selectedAugmentSlot.optionString as string;

    for (const itemCraftable of item.crafting) {
      if (itemCraftable.name == craftable.name) {
        for (const option of itemCraftable.options) {
          if (option.describe() == optionString) {
            itemCraftable.selected = option;
            this.equipped.set(item);
            this.analytics.track('planner_equip_item', {
              equip_source: 'augment_modal',
              slot: item.slot
            });
            this.modalService.dismissAll();
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

  // Duplicated from gear-craftingList
  showItemsInSet(setName: string) {
    this.analytics.track('open_set_items', {
      source: 'bonus_type_modal'
    });
    const dlg = this.modalService.open(ItemsInSetComponent, { ariaLabelledBy: 'modal-basic-title' });

    dlg.componentInstance.setName = setName;

    dlg.result.then((result) => {
      // this.closeResult = `Closed with: ${result}`;
    }, (reason) => {
      // this.closeResult = `Dismissed ${this.getDismissReason(reason)}`;
    });
  }

  close() {
    this.modalService.dismissAll();
  }

}
