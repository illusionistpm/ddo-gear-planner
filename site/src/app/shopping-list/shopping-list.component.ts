import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnChanges, OnDestroy, OnInit,
  QueryList, Type, ViewChild, ViewChildren
} from '@angular/core';
import { Subscription } from 'rxjs';

import { AnalyticsService } from '../shared/analytics.service';
import { FriendShoppingList } from '../planner/shopping-list/friend-shopping-list.service';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import { ShoppingListViewService } from '../planner/shopping-list/shopping-list-view.service';
import { OTHER_SOURCES_LABEL } from '../planner/shopping-list/shopping-list-view-model';
import { ShoppingProgressStore, ShoppingSyncState } from '../planner/shopping-list/shopping-progress-store';
import { GroupCharacter, GroupRunService, GroupRunView, GroupShowing } from '../planner/shopping-list/group-run.service';
import { ownRowState } from '../planner/shopping-list/group-shopping-list';
import type {
  ShoppingFilter, ShoppingListView, ShoppingRow, ShoppingRowMember, ShoppingSection, ShoppingSource, ShoppingSourceChoice
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
  /**
   * A group run's page, making this its list: everyone's rows, each saying
   * which characters it's for. Your own characters' rows tick off; the
   * host also picks quests and arranges the route, which everyone sees.
   */
  @Input() groupRun: GroupRunService | null = null;
  /** The group run's list as it now is, with groupRun. */
  @Input() group: GroupRunView | null = null;
  @ViewChild('header') private header?: ElementRef<HTMLElement>;
  @ViewChildren('sectionTitle') private sectionTitles?: QueryList<ElementRef<HTMLElement>>;
  @ViewChildren('sectionElement') private sectionElements?: QueryList<ElementRef<HTMLElement>>;

  view: ShoppingListView | null = null;
  /** Arrange mode: the route as an outline, to put in order. */
  arranging = false;
  /** ShoppingListArrangeComponent, once loaded. */
  arrangeComponent: Type<unknown> | null = null;
  /** ShoppingListArrangeNavComponent, loaded with it: the sidebar's packs to drag. */
  arrangeNavComponent: Type<unknown> | null = null;
  /** Whether your ticks are on the server too, or only on this device. */
  syncState: ShoppingSyncState = 'off';
  /** The packs with some part on screen, below the sticky header, by section id: marked in the pack list. */
  sectionsInView: ReadonlySet<string> = new Set();
  /** The row whose choice of where to get it is open, if any. */
  expandedRowId: string | null = null;
  /** The row whose last quest the user just tried to untick, to say why it stays. */
  lastQuestHintRowId: string | null = null;
  private readonly subscriptions = new Subscription();
  private sectionObserver?: IntersectionObserver;
  private headerObserver?: ResizeObserver;
  /** Each section observed, and whether it's on screen. */
  private readonly sectionVisibility = new Map<Element, boolean>();

  constructor(
    readonly shoppingList: ShoppingListService,
    private readonly shoppingListView: ShoppingListViewService,
    private readonly progressStore: ShoppingProgressStore,
    private readonly analytics: AnalyticsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly elementRef: ElementRef<HTMLElement>,
    private readonly zone: NgZone
  ) { }

  ngOnInit(): void {
    if (this.friendBuild || this.groupRun) {
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
    } else if (this.groupRun) {
      this.showView(this.group?.view ?? null);
    }
  }

  /** Read only: a friend's list, or the rows of a group run with none of yours. */
  get readOnly(): boolean {
    return !!this.friendBuild;
  }

  /** On a group run's list, whether you may change where things come from and the order: the host may. */
  get canRoute(): boolean {
    return !this.friendBuild && (!this.groupRun || !!this.group?.isHost);
  }

  /** Each character of the group, by build id, for a row's chips. */
  get charactersById(): ReadonlyMap<string, GroupCharacter> {
    const characters = this.group?.characters ?? [];
    if (this.charactersCache?.list !== characters) {
      this.charactersCache = { list: characters, byId: new Map(characters.map(character => [character.buildId, character])) };
    }
    return this.charactersCache.byId;
  }
  private charactersCache?: { list: readonly GroupCharacter[]; byId: ReadonlyMap<string, GroupCharacter> };

  /** The list's heading: whose it is. */
  get heading(): { title: string; subtitle: string | null } {
    if (this.friendBuild) {
      return { title: 'Still needed', subtitle: this.friendBuild.name ? `for ${this.friendBuild.name}` : null };
    }
    if (this.groupRun) {
      return { title: this.group?.name || 'Shopping list', subtitle: null };
    }
    return { title: 'Shopping list', subtitle: null };
  }

  /** How far along the list is: for your own, what's got; for others', what's still needed. Nothing until it arrives. */
  get progressText(): string {
    if (!this.view) {
      return '';
    }
    if (!this.friendBuild && !this.groupRun) {
      return `${this.view.acquired}/${this.view.total} acquired`;
    }
    const needed = this.friendBuild ? this.friend?.needed ?? 0 : this.view.total - this.view.acquired;
    return `${needed} thing${needed === 1 ? '' : 's'} still needed`;
  }

  /**
   * Reset route is offered once something is picked; on your own list also
   * when planning again would list something elsewhere. A group's route only
   * changes when the host picks, so it has nothing to plan again.
   */
  get canResetRoute(): boolean {
    return this.canRoute && !!(this.view?.picked || (!this.groupRun && this.view?.replannable));
  }

  get resetRouteTitle(): string {
    return this.groupRun
      ? 'Forget the quests picked for things, for everyone, and let the list choose again'
      : 'Plan the route again around what\'s still needed, forgetting any quests you picked';
  }

  get arrangeTitle(): string {
    return this.groupRun ? 'Put the packs and quests in the order the group will run them' : 'Put the packs and quests in the order you\'ll run them';
  }

  /** The row's box, on a group run's list: for your characters' copies in it; null when there are none. */
  groupRowState(row: ShoppingRow): 'checked' | 'mixed' | 'unchecked' | null {
    return this.group ? ownRowState(row, this.group.yours) : null;
  }

  /**
   * A group run's list with several characters: each row's chips are its
   * boxes, one per character. With one, the row has a plain box and no chips.
   */
  get multiCharacter(): boolean {
    return (this.group?.characters.length ?? 0) > 1;
  }

  /**
   * Whether a row has a box: always on your own list, never on a friend's, and
   * on a group's of one character when it's yours. With more, the chips are the boxes.
   */
  hasBox(row: ShoppingRow): boolean {
    return !this.friendBuild && (!this.groupRun || (!this.multiCharacter && this.groupRowState(row) !== null));
  }

  /** How a character's chip on a row reads: their copies got, all, some or none. */
  chipState(part: ShoppingRowMember): 'checked' | 'mixed' | 'unchecked' {
    return part.acquired === part.quantity ? 'checked' : part.acquired ? 'mixed' : 'unchecked';
  }

  chipAriaChecked(part: ShoppingRowMember): string {
    const state = this.chipState(part);
    return state === 'checked' ? 'true' : state === 'mixed' ? 'mixed' : 'false';
  }

  chipIcon(part: ShoppingRowMember): string {
    const state = this.chipState(part);
    return state === 'checked' ? 'fa-square-check' : state === 'mixed' ? 'fa-square-minus' : 'fa-square';
  }

  /** How many copies a character's chip is for, and how many are got part way; nothing for one. */
  chipCount(part: ShoppingRowMember): string {
    if (part.quantity === 1) {
      return '';
    }
    return this.chipState(part) === 'mixed' ? `${part.acquired}/${part.quantity}` : `×${part.quantity}`;
  }

  chipLabel(part: ShoppingRowMember, row: ShoppingRow): string {
    const name = this.charactersById.get(part.member)?.characterName ?? '';
    const got = part.acquired === part.quantity ? 'got' : part.acquired ? `${part.acquired} of ${part.quantity} got` : 'still needed';
    return `${row.entry.label} for ${name}: ${got}`;
  }

  /** A tap on one of your characters' chips: its next copy, then all of them off. */
  toggleChip(row: ShoppingRow, part: ShoppingRowMember): void {
    this.analytics.track('toggle_group_shopping_item', { item_kind: row.entry.kind, method: 'chip' });
    this.groupRun?.toggleChip(row, part.member);
  }

  /** Whose rows a group run's list shows. */
  show(showing: GroupShowing): void {
    this.analytics.track('show_group_shopping', { showing: showing === 'everyone' || showing === 'mine' ? showing : 'character' });
    this.groupRun?.show(showing);
  }

  /** What a character's button in the legend says about them. */
  characterTitle(character: GroupCharacter): string {
    if (character.unreadable) {
      return `${character.characterName}'s build was saved by a newer version of the site, so its gear isn't listed here`;
    }
    return `Only ${character.characterName}'s rows (${character.buildName}): ${character.needed} of ${character.total} still needed`;
  }

  /** The class giving a character's chip their colour. */
  memberClass(buildId: string): string {
    return `shopping-member-${this.charactersById.get(buildId)?.accent ?? 0}`;
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

  /** A friend's list: whether changes arrive as they're made. */
  get liveLabel(): { text: string; title: string; live: boolean } | null {
    switch (this.friend?.connection ?? this.group?.connection) {
      case 'live':
        // A list of only your own builds has no one else's changes to show: it's your list, not a shared one.
        return this.group?.characters.every(character => character.mine)
          ? null
          : { text: 'Live', title: 'Changes show here as they\'re made', live: true };
      case 'connecting':
      case 'reconnecting':
        return { text: 'Reconnecting…', title: 'Changes made meanwhile show once it\'s back', live: false };
      case 'offline':
        return { text: 'Offline', title: 'This is the list as it last arrived. It updates once you\'re back online.', live: false };
      default:
        return null;
    }
  }

  /** How many of a section's things are still needed, or for your own list how many are got. */
  sectionCount(section: ShoppingSection): string {
    return this.friendBuild || this.groupRun ? `${section.total - section.acquired}` : `${section.acquired}/${section.total}`;
  }

  /** Shows a view, saying the list opened when its first arrives. */
  private showView(view: ShoppingListView | null): void {
    if (view && !this.view) {
      this.analytics.track('open_shopping_list', {
        entry_point: this.friendBuild ? 'friend_link' : this.groupRun ? 'group_link' : this.shoppingListView.openedFrom,
        item_count: view.total,
        acquired_count: view.acquired,
        has_picks: view.picked
      });
    }
    this.view = view;
    this.cdr.markForCheck();
  }

  get percentAcquired(): number {
    return this.view?.total ? Math.round(100 * this.view.acquired / this.view.total) : 0;
  }

  setFilter(filter: ShoppingFilter): void {
    this.analytics.track('set_shopping_filter', { filter });
    if (this.groupRun) {
      this.groupRun.setFilter(filter);
    } else {
      this.shoppingList.setFilter(filter);
    }
  }

  toggle(row: ShoppingRow): void {
    if (this.groupRun) {
      this.analytics.track('toggle_group_shopping_item', { item_kind: row.entry.kind, method: 'row' });
      this.groupRun.toggleRow(row);
      return;
    }
    this.analytics.track('toggle_shopping_item', { item_kind: row.entry.kind, checked: row.state !== 'checked' });
    this.shoppingList.toggle(row);
  }

  /** The row's box state: the row's own, or on a group run's list, your characters' copies in it. */
  private boxState(row: ShoppingRow): string {
    return (this.groupRun ? this.groupRowState(row) : row.state) ?? 'unchecked';
  }

  ariaChecked(row: ShoppingRow): string {
    const state = this.boxState(row);
    return state === 'checked' ? 'true' : state === 'mixed' ? 'mixed' : 'false';
  }

  checkIcon(row: ShoppingRow): string {
    const state = this.boxState(row);
    return state === 'checked' ? 'fa-square-check' : state === 'mixed' ? 'fa-square-minus' : 'fa-square';
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
    this.pickSources(row, quests);
  }

  async startArranging(): Promise<void> {
    this.analytics.track('arrange_shopping_route', { moved: 'start', has_order: !!this.view?.arranged });
    this.arranging = true;
    this.expandedRowId = null;
    if (!this.arrangeComponent) {
      // Drag-drop is only needed here: loaded on first use.
      const [{ ShoppingListArrangeComponent }, { ShoppingListArrangeNavComponent }] = await Promise.all([
        import('./shopping-list-arrange.component'), import('./shopping-list-arrange-nav.component')
      ]);
      this.arrangeComponent = ShoppingListArrangeComponent;
      this.arrangeNavComponent = ShoppingListArrangeNavComponent;
      this.cdr.markForCheck();
    }
  }

  stopArranging(): void {
    this.arranging = false;
  }

  /** Puts the packs and quests back in the order the list chose. */
  resetOrder(): void {
    this.analytics.track('arrange_shopping_route', { moved: 'reset' });
    (this.groupRun ?? this.shoppingList).resetOrder();
  }

  /** Forgets every pick, and plans the route again around what's still needed. */
  resetRoute(): void {
    this.expandedRowId = null;
    this.analytics.track('reset_shopping_route', { has_picks: !!this.view?.picked });
    if (this.groupRun) {
      void this.groupRun.clearPicks();
    } else {
      this.shoppingList.resetRoute();
    }
  }

  /** Forgets the user's pick, so the list chooses again. */
  resetSources(row: ShoppingRow): void {
    this.analytics.track('pick_shopping_source', { action: 'reset', item_kind: row.entry.kind });
    this.pickSources(row, null);
  }

  private pickSources(row: ShoppingRow, quests: readonly string[] | null): void {
    if (this.groupRun) {
      void this.groupRun.pickSources(row, quests);
    } else {
      this.shoppingList.pickSources(row, quests);
    }
  }

  /** Who Arrange moves the route for: your own list, or the group run's shared route. */
  get arranger(): { arrangePacks(packs: readonly string[]): void; arrangeQuests(quests: readonly string[]): void } {
    return this.groupRun ?? this.shoppingList;
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
