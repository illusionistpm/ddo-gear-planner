import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';

import { Affix } from '../affix';
import { AffixUiService } from '../affix-ui.service';
import { EquippedService, ExternalAffixEntry } from '../equipped.service';

@Component({
  selector: 'app-external-affix-slot-card',
  templateUrl: './external-affix-slot-card.component.html',
  styleUrls: ['./external-affix-slot-card.component.css'],
  host: {
    class: 'mb-3 card col-sm-12 col-md-6 col-lg-4'
  },
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ExternalAffixSlotCardComponent implements OnInit, OnDestroy {
  entries: ExternalAffixEntry[] = [];
  private subscription?: Subscription;

  constructor(
    public equipped: EquippedService,
    private affixUi: AffixUiService,
    private changeDetector: ChangeDetectorRef
  ) { }

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

  getValueText(entry: ExternalAffixEntry): string {
    if (entry.kind === 'ignored') {
      return Affix.isRealType(entry.bonusType) ? entry.bonusType : 'Ignored';
    }
    if (entry.bonusType === 'Bool') {
      return 'Covered';
    }
    const fakeAffix = new Affix({ name: entry.affixName, type: entry.bonusType, value: entry.value });
    return [this.affixUi.getAffixValue(fakeAffix), entry.bonusType].filter(part => part).join(' ');
  }

  getRowClass(entry: ExternalAffixEntry): string {
    if (entry.kind === 'ignored') {
      return '';
    }
    const fakeAffix = new Affix({ name: entry.affixName, type: entry.bonusType, value: entry.value });
    return this.affixUi.getClassForAffix(fakeAffix);
  }

  remove(id: string) {
    this.equipped.removeExternalAffix(id);
  }
}
