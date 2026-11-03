import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output
} from '@angular/core';
import { Subscription } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';

import { CurrentBuildService } from '../build/current-build.service';
import { ShareLinkResolverService, ShareLinkState } from '../build/share-link-resolver.service';
import { shoppingListFragment, snapshotLink } from '../build/shopping-list-link';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';

export type ShoppingListCopyKind = 'link' | 'text_and_link' | 'text';

const COPIED_CONFIRMATION_MS = 1500;

/**
 * The shopping list's open Share menu: a link that opens a friend's view of
 * what's still needed, that with the list as text, or the text alone.
 *
 * The link is the build's own share link (ShareLinkResolverService,
 * resolved as the menu opens so each copy stays synchronous inside its
 * click) with a fragment saying what's still needed:
 * - the build's canonical URL gets #still-needed, live from the server,
 *   which the owner's list keeps up to date while the build is as saved;
 * - a short or long link gets a snapshot of what's still needed now.
 */
@Component({
  selector: 'app-shopping-list-share-menu',
  templateUrl: './shopping-list-share-menu.component.html',
  styleUrls: ['./shopping-list-share-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class ShoppingListShareMenuComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  shareLink: ShareLinkState = { status: 'pending' };
  /** Clipboard.copy() refused, as opposed to the link not being ready. */
  copyError: string | null = null;
  /** Which item last copied something, for its "Copied!". */
  justCopied: ShoppingListCopyKind | null = null;

  private subscription?: Subscription;
  private copiedTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly shareLinks: ShareLinkResolverService,
    private readonly shoppingList: ShoppingListService,
    private readonly currentBuild: CurrentBuildService,
    private readonly auth: AuthService,
    private readonly analytics: AnalyticsService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.subscription = this.auth.isAuthenticated$.pipe(
      take(1),
      switchMap(isAuthenticated => this.shareLinks.resolve(this.currentBuild.value, isAuthenticated))
    ).subscribe(shareLink => {
      this.shareLink = shareLink;
      this.cdr.markForCheck();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
    clearTimeout(this.copiedTimeout);
  }

  get linkLabel(): string {
    return this.shareLink.status === 'pending' ? 'Preparing link…' : 'Copy link';
  }

  get textAndLinkLabel(): string {
    return this.shareLink.status === 'pending' ? 'Preparing link…' : 'Copy list + link';
  }

  copyLink(): void {
    this.copyWithLink('link', url => url);
  }

  copyTextAndLink(): void {
    this.copyWithLink('text_and_link', url => `${this.shoppingList.stillNeededText()}\n${url}`);
  }

  copyText(): void {
    this.finishCopy('text', Clipboard.copy(this.shoppingList.stillNeededText()));
  }

  private copyWithLink(kind: ShoppingListCopyKind, clipboardText: (url: string) => string): void {
    if (this.shareLink.status !== 'ready') {
      // Still minting, or failed: the menu says so, and a click once it's ready is the retry.
      return;
    }
    this.finishCopy(kind, Clipboard.copy(clipboardText(this.listUrl(this.shareLink.url, this.shareLink.kind === 'canonical'))));
  }

  /** The build's link, opening a friend's view of what's still needed. */
  private listUrl(buildUrl: string, live: boolean): string {
    const link = live ? { kind: 'live' as const } : snapshotLink(this.shoppingList.stillNeededKeys());
    // A long link is this page's own URL, with its own fragment on.
    return `${buildUrl.split('#')[0]}#${shoppingListFragment(link)}`;
  }

  private finishCopy(kind: ShoppingListCopyKind, succeeded: boolean): void {
    if (!succeeded) {
      this.copyError = 'Could not copy to the clipboard. Please try again.';
      this.cdr.markForCheck();
      return;
    }
    this.copyError = null;
    this.analytics.track('copy_shopping_list', {
      copy_kind: kind,
      ...(kind === 'text' || this.shareLink.status !== 'ready' ? {} : { link_kind: this.shareLink.kind }),
      needed_count: this.shoppingList.stillNeededKeys().length
    });
    this.justCopied = kind;
    this.cdr.markForCheck();
    clearTimeout(this.copiedTimeout);
    this.copiedTimeout = setTimeout(() => {
      this.justCopied = null;
      this.cdr.markForCheck();
    }, COPIED_CONFIRMATION_MS);
  }
}
