import { Component, OnInit, Input } from '@angular/core';

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
  ) {
  }

  ngOnInit() {
    this.item.subscribe(val => {
      this.curItem = val;
    });
  }

}
