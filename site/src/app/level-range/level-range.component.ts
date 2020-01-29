import { Component, OnInit } from '@angular/core';

import { FiltersService } from '../filters.service';

@Component({
  selector: 'app-level-range',
  templateUrl: './level-range.component.html',
  styleUrls: ['./level-range.component.css']
})
export class LevelRangeComponent implements OnInit {
  minLevel: number;
  maxLevel: number;

  constructor(
    public filters: FiltersService,
  ) {
    filters.getLevelRange().subscribe(val => {
      this.minLevel = val[0];
      this.maxLevel = val[1];
    });
  }

  ngOnInit() {
  }

  onChange() {
    this.filters.setLevelRange(this.minLevel, this.maxLevel);
  }
}
