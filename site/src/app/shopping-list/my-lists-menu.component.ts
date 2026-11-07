import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, Input, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { groupPath, GroupSummary } from '../build/groups.service';
import { MyListsService } from '../build/my-lists.service';
import { AnalyticsService } from '../shared/analytics.service';

/**
 * Lists, beside a shopping list's title: the shopping lists of several
 * builds you host or have a build in, to go to one. Shown only while
 * there's one to go to - on a list's own page, one other than it.
 */
@Component({
  selector: 'app-my-lists-menu',
  templateUrl: './my-lists-menu.component.html',
  styleUrls: ['../shared/share-menu.css', './my-lists-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class MyListsMenuComponent implements OnInit, OnDestroy {
  /** The list on screen, left out of the menu; null on your own build's list. */
  @Input() currentShortId: string | null = null;

  open = false;
  private lists: readonly GroupSummary[] = [];
  private readonly subscription = new Subscription();

  constructor(
    private readonly myLists: MyListsService,
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

  /** The lists to offer, most recently active first. */
  get others(): readonly GroupSummary[] {
    return this.lists.filter(list => list.shortId !== this.currentShortId);
  }

  toggle(): void {
    this.open = !this.open;
    if (this.open) {
      // One may have been joined, left or ended since they were read.
      this.myLists.refresh();
    }
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.open = false;
    this.cdr.markForCheck();
  }

  go(list: GroupSummary): void {
    this.open = false;
    this.analytics.track('open_list', { from: 'lists_menu' });
    this.router.navigateByUrl(groupPath(list.shortId, list.inviteToken));
  }
}
