import { Component, OnInit } from '@angular/core';
import { EquippedService } from '../equipped.service';
import { GearDbService } from '../gear-db.service';

@Component({
  selector: 'app-effects-table',
  templateUrl: './effects-table.component.html',
  styleUrls: ['./effects-table.component.css']
})
export class EffectsTableComponent implements OnInit {

  public effects: Map<string, Array<any>>;
  public effectKeys: Array<any>;
  public allAffixes: Array<any>; // is really Array<string>

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService
  ) {
    this.effectKeys = new Array<object>();
    this.allAffixes = Array.from(this.gearDB.getAllAffixes()).map(e => ({name: e}));
  }

  ngOnInit() {
    this.equipped.getCoveredAffixes().subscribe(map => {
      this.effects = map;
      this.effectKeys = [];
      for (const key of this.effects.keys()) {
        this.effectKeys.push({ name: key });
      }
    });
  }

  onChange() {
    return (affix: any) => {
      this.equipped.addImportantAffix(affix.name);
    }
  }

  removeAffix(affixName) {
    this.equipped.removeImportantAffix(affixName);
  }
}
