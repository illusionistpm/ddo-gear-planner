import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

import { AffixUiService } from '../affixes/affix-ui.service';
import { ExternalAffixEntry, isCoveredExternalAffix } from '../affixes/external-affix';

/**
 * The value of a non-gear entry: "+5 Insight", the ignored bonus type, or a checked box for a checklist
 * affix that is covered. `includeLabel` appends the entry's own label, for views that don't show it separately.
 */
@Component({
  selector: 'app-external-affix-value',
  templateUrl: './external-affix-value.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ExternalAffixValueComponent {
  @Input({ required: true }) entry!: ExternalAffixEntry;
  @Input() includeLabel = false;

  constructor(private affixUi: AffixUiService) { }

  get covered(): boolean {
    return isCoveredExternalAffix(this.entry);
  }

  /** The value as words - also the checked box's accessible name. */
  get description(): string {
    return this.affixUi.describeExternalAffix(this.entry);
  }

  get describedWithLabel(): string {
    return this.affixUi.describeExternalAffix(this.entry, true);
  }
}
