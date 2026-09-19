import { Component, OnDestroy, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { Subscription } from 'rxjs';

import { AffixUiService } from '../affix-ui.service';
import { EquippedService } from '../equipped.service';
import { externalAffixAsAffix, ExternalAffixEntry } from '../external-affix';

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
    return this.affixUi.describeExternalAffix(entry);
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
}
