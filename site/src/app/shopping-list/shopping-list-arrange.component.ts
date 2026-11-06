import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, ElementRef, Input } from '@angular/core';

import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import type { ShoppingGroup, ShoppingSection } from '../planner/shopping-list/shopping-list-types';
import { AnalyticsService } from '../shared/analytics.service';

type ArrangeMethod = 'drag' | 'button';

/** Where Arrange's moves go: ShoppingListService for your own list, GroupRunService for a group run's. */
export interface ShoppingRouteArranger {
  arrangePacks(packs: readonly string[]): void;
  arrangeQuests(quests: readonly string[]): void;
}

/**
 * The shopping list's Arrange mode: the route as an outline - each pack, its
 * quests under it - to put in the order you'll run them. Drag a pack or a
 * quest by its handle, or move it a step with its arrows (the keyboard's
 * way, and a fiddly drag's on a phone). Quests move only within their pack,
 * as that's where they are. An unknown source has no quest to move, and
 * stays last.
 *
 * Standalone, and loaded the first time Arrange is pressed, so drag-drop
 * stays out of the bundle every page load pays for.
 */
@Component({
  selector: 'app-shopping-list-arrange',
  templateUrl: './shopping-list-arrange.component.html',
  styleUrls: ['./shopping-list-arrange.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDropList, CdkDrag, CdkDragHandle]
})
export class ShoppingListArrangeComponent {
  @Input({ required: true }) sections: readonly ShoppingSection[] = [];
  /** Whose route the moves arrange: by default your own list's; a group run's for its host. */
  @Input() arranger: ShoppingRouteArranger | null = null;

  constructor(
    private readonly shoppingList: ShoppingListService,
    private readonly analytics: AnalyticsService,
    private readonly elementRef: ElementRef<HTMLElement>
  ) { }

  /** A pack's quests that can be moved: all but an unknown source. */
  quests(section: ShoppingSection): ShoppingGroup[] {
    return section.groups.filter(group => group.wikiUrl !== null);
  }

  /** What can't be moved, listed last. */
  unmovable(section: ShoppingSection): ShoppingGroup[] {
    return section.groups.filter(group => group.wikiUrl === null);
  }

  dropPack(event: CdkDragDrop<unknown>): void {
    this.movePack(event.previousIndex, event.currentIndex, 'drag');
  }

  dropQuest(section: ShoppingSection, event: CdkDragDrop<unknown>): void {
    this.moveQuest(section, event.previousIndex, event.currentIndex, 'drag');
  }

  /** Moves a pack a step up (-1) or down (1). */
  stepPack(index: number, step: -1 | 1): void {
    this.movePack(index, index + step, 'button');
    this.refocus(`[data-arrange-pack="${index + step}"] > .shopping-arrange-row`, step);
  }

  /** Moves a quest a step up (-1) or down (1) within its pack. */
  stepQuest(section: ShoppingSection, index: number, step: -1 | 1): void {
    const packIndex = this.sections.indexOf(section);
    this.moveQuest(section, index, index + step, 'button');
    this.refocus(`[data-arrange-pack="${packIndex}"] [data-arrange-quest="${index + step}"] > .shopping-arrange-row`, step);
  }

  private movePack(from: number, to: number, method: ArrangeMethod): void {
    if (from === to || to < 0 || to >= this.sections.length) {
      return;
    }
    const packs = this.sections.map(section => section.pack);
    moveItemInArray(packs, from, to);
    this.analytics.track('arrange_shopping_route', { moved: 'pack', method });
    (this.arranger ?? this.shoppingList).arrangePacks(packs);
  }

  private moveQuest(section: ShoppingSection, from: number, to: number, method: ArrangeMethod): void {
    const quests = this.quests(section).map(group => group.label);
    if (from === to || to < 0 || to >= quests.length) {
      return;
    }
    moveItemInArray(quests, from, to);
    this.analytics.track('arrange_shopping_route', { moved: 'quest', method });
    (this.arranger ?? this.shoppingList).arrangeQuests(quests);
  }

  /**
   * Keeps focus on the arrow just pressed, now in the row it moved to - or,
   * at the end of the list where that arrow is disabled, on the other one.
   */
  private refocus(row: string, step: -1 | 1): void {
    setTimeout(() => {
      const moved = this.elementRef.nativeElement.querySelector(row);
      const pressed = moved?.querySelector<HTMLButtonElement>(step < 0 ? '.shopping-arrange-up' : '.shopping-arrange-down');
      const other = moved?.querySelector<HTMLButtonElement>(step < 0 ? '.shopping-arrange-down' : '.shopping-arrange-up');
      (pressed && !pressed.disabled ? pressed : other)?.focus();
    });
  }
}
