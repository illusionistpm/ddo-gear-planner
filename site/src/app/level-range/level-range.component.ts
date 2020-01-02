import { Component, OnInit } from '@angular/core';

import { GearDbService } from '../gear-db.service';

@Component({
  selector: 'app-level-range',
  templateUrl: './level-range.component.html',
  styleUrls: ['./level-range.component.css']
})
export class LevelRangeComponent implements OnInit {
  minLevel: number;
  maxLevel: number;

  constructor(
    public gearDB: GearDbService
  ) {
    this.minLevel = 1;
    this.maxLevel = 30;
  }

  ngOnInit() {
  }

  onChange() {
    if (!this.minLevel || this.minLevel < 1) {
      this.minLevel = 1;
    }

    if (!this.maxLevel || this.maxLevel > 30) {
      this.maxLevel = 30;
    }
    this.gearDB.filterByLevelRange(this.minLevel, this.maxLevel);
  }

}
