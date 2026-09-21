import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';

import { EquippedService } from '../planner/equipped.service';

/**
 * Records where a non-gear contribution to one affix + bonus type comes from - a source label plus a value
 * (or "Covered" for a checklist type) - or marks that combination as ignored. Used by the suggestion
 * drawer and the Non-gear card; `done` fires once an entry has been recorded.
 */
@Component({
  selector: 'app-external-affix-form',
  templateUrl: './external-affix-form.component.html',
  styleUrls: ['./external-affix-form.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class ExternalAffixFormComponent {
  @Input({ required: true }) affixName!: string;
  @Input({ required: true }) bonusType!: string;
  @Output() done = new EventEmitter<void>();
  /** Focus the source label when the form appears. Off by default: the drawer shows this form unprompted. */
  @Input() autofocus = false;

  label = '';
  value: number | null = null;
  checked = false;

  constructor(private equipped: EquippedService) { }

  isChecklistBonusType(): boolean {
    return this.bonusType === 'Bool';
  }

  canAdd(): boolean {
    if (!this.label.trim()) {
      return false;
    }
    return this.isValueEntryStarted();
  }

  isValueEntryStarted(): boolean {
    return this.isChecklistBonusType() ? this.checked : this.value != null;
  }

  add() {
    if (!this.canAdd()) {
      return;
    }
    const label = this.label.trim();
    if (this.isChecklistBonusType()) {
      this.equipped.addExternalAffixValue(this.affixName, this.bonusType, 1, label);
    } else {
      this.equipped.addExternalAffixValue(this.affixName, this.bonusType, this.value!, label);
    }

    this.reset();
    this.done.emit();
  }

  markIgnored() {
    if (this.isValueEntryStarted()) {
      return;
    }
    const label = this.label.trim();
    this.equipped.addExternalAffixIgnored(this.affixName, this.bonusType, label || 'Ignored');
    this.reset();
    this.done.emit();
  }

  private reset() {
    this.label = '';
    this.value = null;
    this.checked = false;
  }
}
