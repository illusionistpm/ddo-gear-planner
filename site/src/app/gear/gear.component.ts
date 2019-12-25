import { Component, OnInit } from '@angular/core';
import { Input } from '@angular/core';

import { Item } from '../item';

@Component({
  selector: 'app-gear',
  templateUrl: './gear.component.html',
  styleUrls: ['./gear.component.css']
})
export class GearComponent implements OnInit {
  @Input() name: string;
  @Input() data: Array<Item>;
  @Input() onChange;
  @Input() onClick;

  constructor() { }

  ngOnInit() {
  }

}
