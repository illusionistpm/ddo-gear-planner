import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-gear-list',
  templateUrl: './gear-list.component.html',
  styleUrls: ['./gear-list.component.css']
})
export class GearListComponent implements OnInit {
  gearTypes = ['Head', 'Neck', 'Body', 'Main Hand', 'Offhand', 'Boots', 'RingStatic', 'RingSwap']

  constructor() { }

  ngOnInit() {
  }

}
