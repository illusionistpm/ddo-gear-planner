import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';

import { AffixService } from '../affixes/affix.service';
import { AffixUiService } from '../affixes/affix-ui.service';
import { buildAffixTypeaheadEntries } from '../affixes/affix-typeahead';
import { isCountAffix } from '../affixes/count-affix';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { externalAffixAsAffix, ExternalAffixEntry, NON_GEAR_DESCRIPTION } from '../affixes/external-affix';
import { TypeaheadEntry, TypeaheadResult } from '../typeahead/typeahead.component';

@Component({
  selector: 'app-external-affix-slot-card',
  templateUrl: './external-affix-slot-card.component.html',
  styleUrls: ['./external-affix-slot-card.component.css'],
  host: {
    class: 'card'
  },
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ExternalAffixSlotCardComponent implements OnInit, OnDestroy {
  readonly description = NON_GEAR_DESCRIPTION;
  entries: ExternalAffixEntry[] = [];

  adding = false;
  selectedAffix = '';
  selectedBonusType = '';
  bonusTypes: string[] = [];
  /** Every affix that can take a non-gear source - the same ones the suggestion drawer offers the panel for. */
  readonly affixSource: TypeaheadEntry[];

  private subscription?: Subscription;

  constructor(
    public equipped: EquippedService,
    private affixUi: AffixUiService,
    private gearDB: GearDbService,
    affixSvc: AffixService,
    private changeDetector: ChangeDetectorRef
  ) {
    this.affixSource = buildAffixTypeaheadEntries(gearDB.getAllAffixes().filter(name => !isCountAffix(name)), affixSvc);
  }

  ngOnInit() {
    this.subscription = this.equipped.getExternalAffixesObservable().subscribe(entries => {
      this.entries = entries;
      this.changeDetector.markForCheck();
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  getNameText(entry: ExternalAffixEntry): string {
    return `${entry.affixName} (${entry.label})`;
  }

  getRowClass(entry: ExternalAffixEntry): string {
    if (entry.kind === 'ignored') {
      return '';
    }
    return this.affixUi.getClassForAffix(externalAffixAsAffix(entry));
  }

  remove(id: string) {
    this.equipped.removeExternalAffix(id);
  }

  toggleAdd() {
    if (this.adding) {
      this.closeAdd();
    } else {
      this.adding = true;
    }
  }

  closeAdd() {
    this.adding = false;
    this.selectedAffix = '';
    this.selectedBonusType = '';
    this.bonusTypes = [];
  }

  /** The typeahead calls this unbound, hence the arrow function. */
  onAffixSelected = (result: TypeaheadResult) => {
    this.selectedAffix = 'original' in result ? result.original : result.name;
    this.bonusTypes = this.gearDB.getTypesForAffix(this.selectedAffix);
    this.selectedBonusType = this.bonusTypes.length === 1 ? this.bonusTypes[0] : '';
    this.changeDetector.markForCheck();
  };
}
