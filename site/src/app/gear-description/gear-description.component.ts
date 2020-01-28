import { CraftableOption } from './../craftable-option';
import { Component, OnInit, Input } from '@angular/core';

import { EquippedService } from '../equipped.service';
import { CannithService } from '../cannith.service';

import { Affix } from '../affix';
import { AffixRank } from '../affix-rank.enum';
import { Craftable } from '../craftable';
import { Item } from '../item';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-gear-description',
  templateUrl: './gear-description.component.html',
  styleUrls: ['./gear-description.component.css']
})
export class GearDescriptionComponent implements OnInit {
  @Input() item: Observable<Item> | Item;
  curItem: Item = null;
  cannithML: number;

  constructor(
    public equipped: EquippedService,
    public cannith: CannithService
  ) {
  }

  ngOnInit() {
    if (this.item instanceof Observable) {
      this.item.subscribe(val => {
        this.curItem = val;
      });
    } else {
      this.curItem = this.item;
    }
  }

  describe(option: CraftableOption) {
    if (option && option.affixes && option.affixes.length) {
      return option.affixes[0].name + ' +' + option.affixes[0].value + ' ' + option.affixes[0].type;
    } else {
      return '';
    }
  }

  updateItem() {
    this.equipped.set(this.curItem);
  }

  updateML() {
    this.cannith.setItemToML(this.curItem, this.cannithML)
    this.equipped.set(this.curItem);
  }

  getAffixValue(affix: Affix) {
    if (affix.value) {
      return (affix.value > 0 ? '+' : '') + affix.value;
    }
    return '';
  }

  getClassForAffix(affix: Affix) {
    const affixRank = this.equipped.getAffixRanking(affix);
    return AffixRank[affixRank];
  }

  getClassForCraftable(craft: Craftable) {
    for (const affix of craft.selected.affixes) {
      const affixRank = this.equipped.getAffixRanking(affix);
      return AffixRank[affixRank];
    }
  }

  getClassForCraftingOption(option: CraftableOption) {
    for (const affix of option.affixes) {
      const affixRank = this.equipped.getAffixRanking(affix);
      return AffixRank[affixRank];
    }
  }
}
