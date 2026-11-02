import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output
} from '@angular/core';
import { Subscription } from 'rxjs';

import { slotLabel } from '../gear/slot-display';
import { AnalyticsService } from '../shared/analytics.service';
import { Clipboard } from '../shared/clipboard';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import type {
  ShoppingFilter, ShoppingGroupMode, ShoppingListView, ShoppingRow
} from '../planner/shopping-list/shopping-list-types';

const COPIED_CONFIRMATION_MS = 1500;

/**
 * The shopping list: everything the build needs, where it comes from, and a
 * box to tick each off. It takes the planner's place on screen while open.
 */
@Component({
  selector: 'app-shopping-list',
  templateUrl: './shopping-list.component.html',
  styleUrls: ['./shopping-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class ShoppingListComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  view: ShoppingListView | null = null;
  /** Feedback on the last Copy list click. */
  copyState: 'idle' | 'copied' | 'failed' = 'idle';
  private subscription?: Subscription;
  private copiedTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    readonly shoppingList: ShoppingListService,
    private readonly analytics: AnalyticsService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.subscription = this.shoppingList.view$.subscribe(view => {
      this.view = view;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    clearTimeout(this.copiedTimeout);
  }

  /** Synchronous inside the click, or the browser refuses the clipboard write (see clipboard.ts). */
  copyStillNeeded(): void {
    clearTimeout(this.copiedTimeout);
    if (!Clipboard.copy(this.shoppingList.stillNeededText())) {
      this.copyState = 'failed';
      return;
    }
    this.analytics.track('copy_shopping_list', {
      copy_kind: 'text',
      needed_count: this.view ? this.view.total - this.view.acquired : 0
    });
    this.copyState = 'copied';
    this.copiedTimeout = setTimeout(() => {
      this.copyState = 'idle';
      this.cdr.markForCheck();
    }, COPIED_CONFIRMATION_MS);
  }

  get percentAcquired(): number {
    return this.view?.total ? Math.round(100 * this.view.acquired / this.view.total) : 0;
  }

  setGroupMode(mode: ShoppingGroupMode): void {
    this.shoppingList.setGroupMode(mode);
  }

  setFilter(filter: ShoppingFilter): void {
    this.shoppingList.setFilter(filter);
  }

  toggle(row: ShoppingRow): void {
    this.shoppingList.toggle(row);
  }

  ariaChecked(row: ShoppingRow): string {
    return row.state === 'checked' ? 'true' : row.state === 'mixed' ? 'mixed' : 'false';
  }

  checkIcon(row: ShoppingRow): string {
    return row.state === 'checked' ? 'fa-square-check' : row.state === 'mixed' ? 'fa-square-minus' : 'fa-square';
  }

  /** What the row is, when its label alone doesn't say. */
  kindLabel(row: ShoppingRow): string {
    switch (row.entry.kind) {
      case 'augment': return 'Augment';
      case 'upgrade': return 'Upgrade';
      default: return '';
    }
  }

  /**
   * Where it comes from, unless the group heading or the item above already
   * says: the first source, and the rest behind a "+N more".
   */
  rowSource(row: ShoppingRow): { first: string; others: string[] } | null {
    if (this.view?.groupMode === 'source' || row.entry.sourceInherited) {
      return null;
    }
    const [first, ...others] = row.entry.sources.map(source => source.quest);
    return { first: first ?? 'Source unknown', others };
  }

  /** The tooltip listing the quests a row doesn't name. */
  alsoFromTooltip(quests: readonly string[]): string {
    return ['Also from:', ...quests].join('\n');
  }

  /** The class giving a card or pack heading its pack's colour. */
  accentClass(accent: number | null): string {
    return accent === null ? 'shopping-accent-none' : `shopping-accent-${accent}`;
  }

  /** A row for gear says which slot it's for, unless it folds the item for several. */
  rowSlot(row: ShoppingRow): string | null {
    return row.entry.kind === 'gear' && row.quantity === 1 ? slotLabel(row.entry.slot) : null;
  }
}
