import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { CouponOption, PackChecklistModel, PackOption, PackSort, allChecked, someChecked } from './pack-checklist-model';

/**
 * The "packs I own" checklist: coupons that tick several packs at once, the
 * packs by group, a search and a sort. It edits the model it's given and says
 * so through `changed`, with what was used ('subgroup', 'group', 'coupon'),
 * for the host to store the model's hiddenPacks(). Shown in the filter sheet
 * and in the start page's setup.
 */
@Component({
  selector: 'app-pack-checklist',
  templateUrl: './pack-checklist.component.html',
  styleUrls: ['./pack-checklist.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: true,
  imports: [FormsModule]
})
export class PackChecklistComponent {
  @Input({ required: true }) model!: PackChecklistModel;
  /** The heading over the checklist. */
  @Input() heading = 'Packs I own';
  @Output() changed = new EventEmitter<string>();

  areAllChecked(options: ReadonlyArray<PackOption>): boolean {
    return allChecked(options);
  }

  areSomeChecked(options: ReadonlyArray<PackOption>): boolean {
    return someChecked(options);
  }

  setSort(sort: PackSort): void {
    this.model.setSort(sort);
  }

  togglePacks(options: ReadonlyArray<PackOption>, source: string): void {
    this.model.togglePacks(options);
    this.changed.emit(source);
  }

  onChangePackOption(): void {
    this.changed.emit('subgroup');
  }

  onSelectQuestingCoupon(index: string): void {
    this.model.selectQuestingCoupon(Number(index));
    this.changed.emit('coupon');
  }

  couponTitle(coupon: CouponOption): string {
    const packs = coupon.options.length === 1 ? '1 pack' : `${coupon.options.length} packs`;
    return `${packs}. Redeemable ${coupon.available}.`;
  }
}
