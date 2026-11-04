import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, EventEmitter, HostListener, Input, NgZone,
  OnChanges, OnDestroy, OnInit, Output, QueryList, Type, ViewChild, ViewChildren
} from '@angular/core';
import { Subscription } from 'rxjs';

import { AnalyticsService } from '../shared/analytics.service';
import { FriendShoppingList, FriendShoppingListService } from '../planner/shopping-list/friend-shopping-list.service';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import { ShoppingListViewService } from '../planner/shopping-list/shopping-list-view.service';
import { OTHER_SOURCES_LABEL } from '../planner/shopping-list/shopping-list-view-model';
import { ShoppingProgressStore, ShoppingSyncState } from '../planner/shopping-list/shopping-progress-store';
import type {
  ShoppingFilter, ShoppingListView, ShoppingRow, ShoppingSection, ShoppingSource, ShoppingSourceChoice
} from '../planner/shopping-list/shopping-list-types';

/** Room left between the sticky header and a pack's heading scrolled up to it. */
const SECTION_SCROLL_GAP_PX = 8;

/** A friend's build, as its still-needed page shows it. */
export interface FriendBuildHeading {
  name: string;
  /** Where the planner opens the build. */
  plannerPath: string;
}

/**
 * The shopping list: everything the build needs, where it comes from, and a
 * box to tick each off. It takes the planner's place on screen while open.
 *
 * On a friend's still-needed page (given `friendBuild`) it's read only:
 * just what's still needed and where to get it, without boxes, picks or
 * anything from your own trove.
 */
@Component({
  selector: 'app-shopping-list',
  templateUrl: './shopping-list.component.html',
  styleUrls: ['./shopping-list.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class ShoppingListComponent implements OnInit, OnChanges, AfterViewInit, OnDestroy {
  /** A friend's build, making this its read-only still-needed list; null for your own list. */
  @Input() friendBuild: FriendBuildHeading | null = null;
  /** A friend's view of the build's list, with friendBuild. */
  @Input() friend: FriendShoppingList | null = null;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('header') private header?: ElementRef<HTMLElement>;
  @ViewChildren('sectionTitle') private sectionTitles?: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('sectionElement') private sectionElements?: QueryList<ElementRef<HTMLElement>>;

  view: ShoppingListView | null = null;
  /** A friend's list can be fetched again (not more than every 30 s). */
  canRefresh = false;
  /** The Share menu is open. */
  shareOpen = false;
  /** Arrange mode: the route as an outline, to put in order. */
  arranging = false;
  /** ShoppingListArrangeComponent, once loaded. */
  arrangeComponent: Type<unknown> | null = null;
  /** Whether your ticks are on the server too, or only on this device. */
  syncState: ShoppingSyncState = 'off';
  /** The packs with some part on screen, below the sticky header, by section id: marked in the pack list. */
  sectionsInView: ReadonlySet<string> = new Set();
  /** The row whose choice of where to get it is open, if any. */
  expandedRowId: string | null = null;
  /** The row whose last quest the user just tried to untick, to say why it stays. */
  lastQuestHintRowId: string | null = null;
  private readonly subscriptions = new Subscription();
  private refreshTimeout?: ReturnType<typeof setTimeout>;
  private sectionObserver?: IntersectionObserver;
  private headerObserver?: ResizeObserver;
  /** Each section observed, and whether it's on screen. */
  private readonly sectionVisibility = new Map<Element, boolean>();

  constructor(
    readonly shoppingList: ShoppingListService,
    private readonly shoppingListView: ShoppingListViewService,
    private readonly friendList: FriendShoppingListService,
    private readonly progressStore: ShoppingProgressStore,
    private readonly analytics: AnalyticsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly zone: NgZone
  ) { }

  ngOnInit(): void {
    if (this.friendBuild) {
      return;
    }
    this.subscriptions.add(this.shoppingList.view$.subscribe(view => this.showView(view)));
    this.subscriptions.add(this.progressStore.syncState$.subscribe(syncState => {
      this.syncState = syncState;
      this.cdr.markForCheck();
    }));
  }

  ngOnChanges(): void {
    if (this.friendBuild) {
      this.showView(this.friend?.view ?? null);
      this.scheduleRefresh();
    }
  }

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined' || !this.sectionElements) {
      return;
    }
    // The header wraps as the list narrows, and what's under it isn't on screen.
    this.zone.runOutsideAngular(() => {
      this.headerObserver = new ResizeObserver(() => this.observeSections());
      if (this.header) {
        this.headerObserver.observe(this.header.nativeElement);
      }
    });
    this.subscriptions.add(this.sectionElements.changes.subscribe(() => this.observeSections()));
    this.observeSections();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.refreshTimeout);
    this.sectionObserver?.disconnect();
    this.headerObserver?.disconnect();
  }

  /** Watches each pack's section scroll through the host, which is what scrolls, below the header. */
  private observeSections(): void {
    this.sectionObserver?.disconnect();
    this.sectionVisibility.clear();
    const headerHeight = Math.round(this.header?.nativeElement.getBoundingClientRect().height ?? 0);
    this.zone.runOutsideAngular(() => {
      this.sectionObserver = new IntersectionObserver(entries => this.sectionsSeen(entries),
        { root: this.elementRef.nativeElement, rootMargin: `-${headerHeight}px 0px 0px 0px` });
    });
    this.sectionElements?.forEach(section => this.sectionObserver!.observe(section.nativeElement));
    // No packs listed (Arrange mode, say): nothing will report, so none are on screen. After
    // this check, which already drew the pack list: the observer's own reports come later too.
    if (!this.sectionElements?.length) {
      Promise.resolve().then(() => this.sectionsSeen([]));
    }
  }

  private sectionsSeen(entries: readonly IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      this.sectionVisibility.set(entry.target, entry.isIntersecting);
    }
    const inView = new Set(Array.from(this.sectionVisibility)
      .filter(([, visible]) => visible)
      .map(([section]) => (section as HTMLElement).dataset['sectionId'] ?? ''));
    if (inView.size !== this.sectionsInView.size || [...inView].some(id => !this.sectionsInView.has(id))) {
      this.zone.run(() => {
        this.sectionsInView = inView;
        this.cdr.markForCheck();
      });
    }
  }

  toggleShare(): void {
    this.shareOpen = !this.shareOpen;
  }

  @HostListener('document:keydown.escape')
  closeShare(): void {
    this.shareOpen = false;
    this.cdr.markForCheck();
  }

  /** Where your ticks are kept, when that's worth saying; null to say nothing. */
  get syncLabel(): { text: string; title: string } | null {
    switch (this.syncState) {
      case 'saving':
        return { text: 'Saving…', title: "Saving your ticks with the build, for your other devices and friends' links" };
      case 'synced':
        return { text: 'Saved', title: "Your ticks are saved with the build, for your other devices and friends' links" };
      case 'offline':
        return { text: 'Offline', title: "Saved on this device. They'll be saved with the build once it's back online." };
      case 'local':
        return { text: 'Saved on this device', title: "Couldn't save your ticks with the build for now, so they're only on this device" };
      default:
        return null;
    }
  }

  /** Fetches a friend's list again. */
  refresh(): void {
    if (this.friendList.refresh()) {
      this.analytics.track('refresh_shopping_list', { needed_count: this.friend?.needed ?? 0 });
    }
    this.scheduleRefresh();
  }

  /** How many of a section's things are still needed, or for your own list how many are got. */
  sectionCount(section: ShoppingSection): string {
    return this.friendBuild ? `${section.total - section.acquired}` : `${section.acquired}/${section.total}`;
  }

  /** Shows a view, saying the list opened when its first arrives. */
  private showView(view: ShoppingListView | null): void {
    if (view && !this.view) {
      this.analytics.track('open_shopping_list', {
        entry_point: this.friendBuild ? 'friend_link' : this.shoppingListView.openedFrom,
        item_count: view.total,
        acquired_count: view.acquired,
        has_picks: view.picked
      });
    }
    this.view = view;
    this.cdr.markForCheck();
  }

  /** Enables Refresh once it may fetch again. */
  private scheduleRefresh(): void {
    clearTimeout(this.refreshTimeout);
    const wait = this.friendList.nextRefreshAt - Date.now();
    this.canRefresh = !!this.friendBuild && wait <= 0;
    if (this.friendBuild && wait > 0) {
      this.refreshTimeout = setTimeout(() => this.scheduleRefresh(), wait);
    }
    this.cdr.markForCheck();
  }

  get percentAcquired(): number {
    return this.view?.total ? Math.round(100 * this.view.acquired / this.view.total) : 0;
  }

  setFilter(filter: ShoppingFilter): void {
    this.analytics.track('set_shopping_filter', { filter });
    this.shoppingList.setFilter(filter);
  }

  toggle(row: ShoppingRow): void {
    this.analytics.track('toggle_shopping_item', { item_kind: row.entry.kind, checked: row.state !== 'checked' });
    this.shoppingList.toggle(row);
  }

  ariaChecked(row: ShoppingRow): string {
    return row.state === 'checked' ? 'true' : row.state === 'mixed' ? 'mixed' : 'false';
  }

  checkIcon(row: ShoppingRow): string {
    return row.state === 'checked' ? 'fa-square-check' : row.state === 'mixed' ? 'fa-square-minus' : 'fa-square';
  }

  /** Opens or closes a row's choice of where to get it. */
  toggleSources(row: ShoppingRow): void {
    this.expandedRowId = this.expandedRowId === row.id ? null : row.id;
    this.lastQuestHintRowId = null;
  }

  /**
   * Lists the thing under a quest too, or no longer there. The last quest
   * can't be unticked, as the thing has to be got somewhere: the click is
   * undone, and the panel says why.
   */
  toggleSource(event: Event, row: ShoppingRow, toggled: ShoppingSourceChoice): void {
    const quests = row.choices
      .filter(choice => choice === toggled ? !choice.chosen : choice.chosen)
      .map(choice => choice.source.quest);
    if (!quests.length) {
      event.preventDefault();
      this.lastQuestHintRowId = row.id;
      this.analytics.track('pick_shopping_source', { action: 'blocked', item_kind: row.entry.kind });
      return;
    }
    this.lastQuestHintRowId = null;
    this.analytics.track('pick_shopping_source', {
      action: toggled.chosen ? 'remove' : 'add',
      item_kind: row.entry.kind,
      quest_count: quests.length
    });
    this.shoppingList.pickSources(row, quests);
  }

  async startArranging(): Promise<void> {
    this.analytics.track('arrange_shopping_route', { moved: 'start', has_order: !!this.view?.arranged });
    this.arranging = true;
    this.expandedRowId = null;
    if (!this.arrangeComponent) {
      // Drag-drop is only needed here: loaded on first use.
      const { ShoppingListArrangeComponent } = await import('./shopping-list-arrange.component');
      this.arrangeComponent = ShoppingListArrangeComponent;
      this.cdr.markForCheck();
    }
  }

  stopArranging(): void {
    this.arranging = false;
  }

  /** Puts the packs and quests back in the order the list chose. */
  resetOrder(): void {
    this.analytics.track('arrange_shopping_route', { moved: 'reset' });
    this.shoppingList.resetOrder();
  }

  /** Forgets every pick, and plans the route again around what's still needed. */
  resetRoute(): void {
    this.expandedRowId = null;
    this.analytics.track('reset_shopping_route', { has_picks: !!this.view?.picked });
    this.shoppingList.resetRoute();
  }

  /** Forgets the user's pick, so the list chooses again. */
  resetSources(row: ShoppingRow): void {
    this.analytics.track('pick_shopping_source', { action: 'reset', item_kind: row.entry.kind });
    this.shoppingList.pickSources(row, null);
  }

  /** What else picking a quest means: its pack, what else you'd get there, whether the pack filter hides it. */
  choiceNote(choice: ShoppingSourceChoice): string {
    const notes = [choice.source.pack ?? OTHER_SOURCES_LABEL];
    if (choice.hidden) {
      notes.push('hidden by your pack filter');
    } else if (choice.alsoThere) {
      notes.push(`${choice.alsoThere} other thing${choice.alsoThere === 1 ? '' : 's'} there`);
    } else {
      notes.push('nothing else there');
    }
    return notes.join(' · ');
  }

  /** The tooltip listing the quests a row doesn't name. */
  alsoFromTooltip(sources: readonly ShoppingSource[]): string {
    return ['Also from:', ...sources.map(source => source.quest)].join('\n');
  }

  /**
   * Scrolls a pack's heading up to just under the sticky header, and moves
   * focus there so the keyboard carries on from it. The host is what scrolls.
   */
  scrollToSection(index: number): void {
    const title = this.sectionTitles?.get(index)?.nativeElement;
    if (!title || !this.header) {
      return;
    }
    this.analytics.track('jump_to_shopping_pack', { pack_index: index, pack_count: this.view?.sections.length ?? 0 });
    const host = this.elementRef.nativeElement;
    const offset = title.getBoundingClientRect().top - this.header.nativeElement.getBoundingClientRect().bottom;
    host.scrollTop += offset - SECTION_SCROLL_GAP_PX;
    title.focus({ preventScroll: true });
  }

  /** The class giving a card or pack heading its pack's colour. */
  accentClass(accent: number | null): string {
    return accent === null ? 'shopping-accent-none' : `shopping-accent-${accent}`;
  }
}
