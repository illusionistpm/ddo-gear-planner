import { Component, OnInit, Input } from '@angular/core';

import { EquippedService } from '../equipped.service';

import { Item } from '../item';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-gear-description',
  templateUrl: './gear-description.component.html',
  styleUrls: ['./gear-description.component.css']
})
export class GearDescriptionComponent implements OnInit {
  @Input() item: Observable<Item>;
  curItem: Item = null;

  constructor(
    public equipped: EquippedService
  ) {
  }

  ngOnInit() {
    this.item.subscribe(val => {
      this.curItem = val;
    });
  }

  describe(option) {
    if (option && option.affixes && option.affixes.length) {
      return option.affixes[0].name + " +" + option.affixes[0].value + " " + option.affixes[0].type;
    } else {
      return "";
    }
  }

  updateItem() {
    this.equipped.set(this.curItem);
  }

}
