import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { CurrentBuildService } from '../build/current-build.service';
import { groupPath, GroupSummary } from '../build/groups.service';
import { ListReturnService } from '../build/list-return.service';
import { MyListsService } from '../build/my-lists.service';
import { EquippedService } from '../planner/equipped.service';
import { AnalyticsService } from '../shared/analytics.service';

/** One shopping list the menu offers; the one on screen is checked, not offered. */
export interface ListsMenuEntry {
  key: string;
  name: string;
  meta: string;
  current: boolean;
  /** Your build's own list, as against one of several builds. */
  own: boolean;
  /** Other people are on it - a group run - and how, to say so; null for a list of only yours. */
  group: string | null;
  url: string;
}

/** Who's on a list, so lists with the same name can be told apart: its characters, or failing those how many builds. */
function listMembersOf(list: GroupSummary): string {
  return list.characterNames.length ? list.characterNames.join(', ') : `${list.buildCount} build${list.buildCount === 1 ? '' : 's'}`;
}

/** Whether other people are on a list, and how: a list you host with friends' builds on it, or someone else's. */
function groupRunOf(list: GroupSummary): string | null {
  if (!list.isHost) {
    return 'Group run: hosted by a friend';
  }
  return list.buildCount > list.yourBuildIds.length ? 'Group run: friends\' builds are on it' : null;
}

/**
 * Lists, beside a shopping list's title: a switcher between your build's
 * own list and the shopping lists of several builds you host or have a build
 * in, with the one on screen checked. Your build's list is there once the
 * planner holds a build to go back to. Shown only while there's another list
 * to go to.
 */
@Component({
  selector: 'app-my-lists-menu',
  templateUrl: './my-lists-menu.component.html',
  styleUrls: ['../shared/share-menu.css', '../shared/pill-button.css', './my-lists-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class MyListsMenuComponent implements OnInit, OnDestroy {
  /** The list on screen; null on your own build's list. */
  @Input() currentShortId: string | null = null;
  /**
   * The list on screen is yours to manage: an icon-only end to the Lists
   * pill opens your menu for it, which goes in `[listsMenuManage]`. Shown
   * with or without Lists.
   */
  @Input() manage = false;
  /** That menu is open. */
  @Input() manageOpen = false;
  @Output() readonly manageToggle = new EventEmitter<void>();

  open = false;
  private lists: readonly GroupSummary[] = [];
  private readonly subscription = new Subscription();

  constructor(
    private readonly myLists: MyListsService,
    private readonly listReturn: ListReturnService,
    private readonly currentBuild: CurrentBuildService,
    private readonly equipped: EquippedService,
    private readonly router: Router,
    private readonly analytics: AnalyticsService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.subscription.add(this.myLists.lists$.subscribe(lists => {
      this.lists = lists;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  /** Your build's list first, then the lists of several builds, most recently active first. */
  get entries(): ListsMenuEntry[] {
    const entries: ListsMenuEntry[] = [];
    const onOwn = this.currentShortId === null;
    if (onOwn || (this.listReturn.hasPlanner && !this.equipped.isBuildEmpty())) {
      entries.push({
        key: '', name: this.currentBuild.value.name || 'Your build', meta: 'this build',
        current: onOwn, own: true, group: null, url: this.listReturn.listUrl
      });
    }
    for (const list of this.lists) {
      entries.push({
        key: list.shortId,
        name: list.name || 'Shopping list',
        meta: `${listMembersOf(list)}${list.isHost ? ' · host' : ''}`,
        current: list.shortId === this.currentShortId,
        own: false,
        group: groupRunOf(list),
        url: groupPath(list.shortId, list.inviteToken)
      });
    }
    return entries;
  }

  /** How many lists there are to go to, besides the one on screen. */
  get elsewhere(): number {
    return this.entries.filter(entry => !entry.current).length;
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) {
      // One may have been joined, left or ended since they were read.
      this.myLists.refresh();
    }
  }

  close(): void {
    this.open = false;
    this.cdr.markForCheck();
  }

  go(entry: ListsMenuEntry): void {
    this.open = false;
    if (entry.current) {
      return;
    }
    this.analytics.track('open_list', { from: entry.own ? 'lists_menu_own' : 'lists_menu' });
    this.router.navigateByUrl(entry.url);
  }
}
