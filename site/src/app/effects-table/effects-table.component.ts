import { Component, OnInit } from '@angular/core';
import { EquippedService } from '../equipped.service';

@Component({
  selector: 'app-effects-table',
  templateUrl: './effects-table.component.html',
  styleUrls: ['./effects-table.component.css']
})
export class EffectsTableComponent implements OnInit {

  public effects: Map<string, Array<any>>;

  constructor(
    public equipped: EquippedService
  ) { }

  ngOnInit() {
    this.equipped.getCoveredAffixes().subscribe(map => { this.effects = map; });
  }
}
