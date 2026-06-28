import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Input } from '@angular/core';

import { Item } from '../item';

@Component({
    selector: 'app-gear',
    templateUrl: './gear.component.html',
    styleUrls: ['./gear.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class GearComponent implements OnInit {
  @Input() data: Array<Item>;
  @Input() onChange;
  @Input() item;

  constructor() { }

  ngOnInit() {
  }

}
