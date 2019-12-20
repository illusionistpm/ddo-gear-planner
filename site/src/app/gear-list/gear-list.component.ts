import { Component, OnInit } from '@angular/core';

import { GearDbService } from '../gear-db.service';

@Component({
  selector: 'app-gear-list',
  templateUrl: './gear-list.component.html',
  styleUrls: ['./gear-list.component.css']
})
export class GearListComponent implements OnInit {

  constructor(
    public gearList: GearDbService
  ) {
  }

  ngOnInit() {
  }

}
