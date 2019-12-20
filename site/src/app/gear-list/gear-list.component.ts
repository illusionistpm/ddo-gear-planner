import { Component, OnInit } from '@angular/core';

import { GearDbService } from '../gear-db.service';
import { EquippedService } from '../equipped.service';

@Component({
  selector: 'app-gear-list',
  templateUrl: './gear-list.component.html',
  styleUrls: ['./gear-list.component.css']
})
export class GearListComponent implements OnInit {

  constructor(
    public gearList: GearDbService,
    public equipped: EquippedService
  ) {
  }

  ngOnInit() {
  }

}
