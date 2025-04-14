import { Component, OnInit, Input } from '@angular/core';
import { NgbModal } from '@ng-bootstrap/ng-bootstrap';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';
import { Item } from '../item';
import { Affix } from '../affix';
import { Craftable } from '../craftable';

import { ItemsInSetComponent } from './../items-in-set/items-in-set.component';
import { AffixService } from '../affix.service';
import { CraftableOption } from '../craftable-option';

@Component({
  selector: 'app-items-with-bonus-type',
  templateUrl: './items-with-bonus-type.component.html',
  styleUrls: ['./items-with-bonus-type.component.css']
})
export class ItemsWithBonusTypeComponent implements OnInit {

  @Input() affixName: string;
  @Input() bonusType: string;

  matches: Array<Item>;
  lockedMatches: Array<Item>;

  optionToEligibleGear: Map<string, Map<Item, Array<Craftable>>>;
  stringToOption: Map<string, CraftableOption>;

  sets: Array<[string, number, number]>;

  setMatches: Array<[string, Array<Affix>, Array<Item>]>;

  selectedAugmentSlot: any;

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    private modalService: NgbModal,
    private affixSvc: AffixService
  ) {
  }

  ngOnInit() {
    this.matches = [];
    this.lockedMatches = [];

    const matchingGear = this.gearDB.findGearWithAffixAndType(this.affixName, this.bonusType);
    for (const item of matchingGear) {
      if (this.equipped.getUnlockedSlots().has(item.slot)) {
        this.matches.push(item);
      } else {
        this.lockedMatches.push(item);
      }
    }

    // This is a map of, e.g., Diamond of Str 14 -> Boots Of Innocence -> [Blue Augment, Colorless Augment]
    // This allows me to build a list that looks something like
    // ML | Diamond of Strength +14 | ComboBox of Eligible Item/Slot combinations | 14 | Equip button
    // I feel like I've overcomplicated this, but it works.
    this.optionToEligibleGear = new Map<string, Map<Item, Array<Craftable>>>();
    this.stringToOption = new Map<string, CraftableOption>();
    
    const matchingAugments = this.gearDB.findAugmentsWithAffixAndType(this.affixName, this.bonusType);
    matchingAugments.forEach((matchingAugmentCraftable) => {
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
            for (const option of matchingAugmentCraftable.options) {
              if (!this.optionToEligibleGear.has(option.describe())) {
                this.stringToOption.set(option.describe(), option);
              }

              if (!this.optionToEligibleGear.has(option.describe())) {
                this.optionToEligibleGear.set(option.describe(), new Map<Item, Array<Craftable>>());
              }
              if (!this.optionToEligibleGear.get(option.describe()).has(item)) {
                this.optionToEligibleGear.get(option.describe()).set(item, []);
              }
              this.optionToEligibleGear.get(option.describe()).get(item).push(matchingAugmentCraftable);
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

  isRealType(bonusType) {
    return Affix.isRealType(bonusType);
  }

  _sortByValue(array: Array<Item>) {
    return array.sort((a, b) =>
      Number(b.getValue(this.affixName, this.bonusType, this.affixSvc)) - Number(a.getValue(this.affixName, this.bonusType, this.affixSvc)));
  }

  findMatchingValue(item: Item) {
    const ret = item.getMatchingBonusType(this.affixName, this.bonusType, this.affixSvc);
    let crafting = ret[0] || '';
    if (crafting) {
      crafting = ' (' + crafting + ')';
    }
    const value = ret[1] || '';

    return [crafting, value];
  }

  equipItem(item: Item) {
    // Apply the relevant crafting option, if any
    item.selectMatchingBonusType(this.affixName, this.bonusType);

    this.equipped.set(item);
    this.modalService.dismissAll();
  }

  equipAugment() {
    const item = this.selectedAugmentSlot.item as Item;
    const craftable = this.selectedAugmentSlot.craftable as Craftable;
    const optionString = this.selectedAugmentSlot.optionString as string;

    for (const itemCraftable of item.crafting) {
      if (itemCraftable.name == craftable.name) {
        for (const option of itemCraftable.options) {
          if (option.describe() == optionString) {
            itemCraftable.selected = option;
            this.equipped.set(item);
            this.modalService.dismissAll();
            return;
          }
        }
      }
    }

    console.error('Unable to find matching option for ' + item.name + ' ' + craftable.name + ' ' + optionString);
  }

  // Duplicated from gear-craftingList
  showItemsInSet(setName: string) {
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
