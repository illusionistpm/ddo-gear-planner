import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import type { ShoppingSection } from '../planner/shopping-list/shopping-list-types';
import { AnalyticsService } from '../shared/analytics.service';
import { movePack, ShoppingRouteArranger } from './shopping-list-arrange.component';

/**
 * The route's packs in the sidebar while arranging, to drag into order: the
 * outline beside it is long once each quest lists what's got there, and this
 * fits on screen. A mouse's shortcut only - the outline's arrows are the
 * keyboard's way, and the sidebar is only shown on wide screens.
 *
 * Loaded with ShoppingListArrangeComponent, for the same reason.
 */
@Component({
  selector: 'app-shopping-list-arrange-nav',
  templateUrl: './shopping-list-arrange-nav.component.html',
  styleUrls: ['./shopping-list-arrange-nav.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDropList, CdkDrag]
})
export class ShoppingListArrangeNavComponent {
  @Input({ required: true }) sections: readonly ShoppingSection[] = [];
  @Input({ required: true }) arranger!: ShoppingRouteArranger;

  constructor(private readonly analytics: AnalyticsService) { }

  drop(event: CdkDragDrop<unknown>): void {
    movePack(this.sections, event.previousIndex, event.currentIndex, 'sidebar', this.arranger, this.analytics);
  }
}
