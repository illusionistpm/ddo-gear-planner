import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output
} from '@angular/core';
import { Subscription } from 'rxjs';

import { AnalyticsService } from '../shared/analytics.service';
import { Clipboard } from '../shared/clipboard';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import type { ShoppingFilter, ShoppingListView, ShoppingRow, ShoppingSource } from '../planner/shopping-list/shopping-list-types';

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

  /** The tooltip listing the quests a row doesn't name. */
  alsoFromTooltip(sources: readonly ShoppingSource[]): string {
    return ['Also from:', ...sources.map(source => source.quest)].join('\n');
  }

  /** The class giving a card or pack heading its pack's colour. */
  accentClass(accent: number | null): string {
    return accent === null ? 'shopping-accent-none' : `shopping-accent-${accent}`;
  }
}
