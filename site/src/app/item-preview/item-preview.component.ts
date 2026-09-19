import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';

import { EquippedService } from '../planner/equipped.service';
import { Item } from '../gear/item';
import { ItemPreviewController } from './item-preview-controller';

/**
 * The item preview panel beside a suggestion drawer: the previewed item with
 * previous/next through the drawer's list, a wiki link, and Equip. Equipping
 * is left to the owner via (equip), since each drawer tracks it differently.
 */
@Component({
    selector: 'app-item-preview',
    templateUrl: './item-preview.component.html',
    styleUrls: ['./item-preview.component.css'],
    // The controller is mutated in place, so there is no input change for OnPush to see.
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ItemPreviewComponent {
  @Input({ required: true }) preview!: ItemPreviewController;
  @Input() highlightAffixName: string | null = null;
  @Input() highlightBonusType: string | null = null;
  @Output() equip = new EventEmitter<Item>();

  constructor(public equipped: EquippedService) { }
}
