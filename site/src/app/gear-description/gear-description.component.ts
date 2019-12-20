import { Component, OnInit, Input } from '@angular/core';

import { EquippedService } from '../equipped.service';

@Component({
  selector: 'app-gear-description',
  templateUrl: './gear-description.component.html',
  styleUrls: ['./gear-description.component.css']
})
export class GearDescriptionComponent implements OnInit {
  @Input() slot: string;

  constructor(
    public equipped: EquippedService
  ) { }

  ngOnInit() {
  }

}
