import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';

import { stillNeededPath } from '../build/build-route';
import { CurrentBuildService } from '../build/current-build.service';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';

export type ShoppingListCopyKind = 'link' | 'text_and_link' | 'text';

/**
 * Whether this build's list can be shared live, and if not, what it takes:
 * - sign-in: signed out;
 * - save: signed in, a build never saved;
 * - save-copy: someone else's build, which only its owner's list follows;
 * - save-changes: a saved build of yours with changes on screen - a
 *   friend's link shows the build as saved, so its list would differ;
 * - ready: a saved build of yours, as saved.
 */
export type LiveShare = 'sign-in' | 'save' | 'save-copy' | 'save-changes' | 'ready';

const COPIED_CONFIRMATION_MS = 1500;

/**
 * The shopping list's open Share menu: a link that opens a friend's view of
 * what's still needed, that with the list as text, or the text alone.
 *
 * The link is live - it follows the owner's ticks and saves, which only
 * the server can carry - so it's offered for a saved build of yours, and
 * while there are unsaved changes it's offered but disabled, with a hint
 * to save. Any other build gets the text alone, and a hint at what a live
 * list takes: a list that couldn't change after copying would be just that.
 */
@Component({
  selector: 'app-shopping-list-share-menu',
  templateUrl: './shopping-list-share-menu.component.html',
  styleUrls: ['../shared/share-menu.css', './shopping-list-share-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class ShoppingListShareMenuComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  /** Clipboard.copy() refused. */
  copyError: string | null = null;
  /** Which item last copied something, for its "Copied!". */
  justCopied: ShoppingListCopyKind | null = null;

  private signedIn = false;
  private copiedTimeout?: ReturnType<typeof setTimeout>;
  private readonly subscription = new Subscription();

  constructor(
    private readonly shoppingList: ShoppingListService,
    private readonly currentBuild: CurrentBuildService,
    private readonly auth: AuthService,
    private readonly analytics: AnalyticsService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.subscription.add(this.auth.isAuthenticated$.subscribe(signedIn => {
      this.signedIn = signedIn;
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
    clearTimeout(this.copiedTimeout);
  }

  get liveShare(): LiveShare {
    const { savedBuildId, shortId, isDirty, ownership } = this.currentBuild.value;
    if (!this.signedIn) {
      return 'sign-in';
    }
    if (!savedBuildId || !shortId || ownership !== 'owned') {
      return shortId ? 'save-copy' : 'save';
    }
    return isDirty ? 'save-changes' : 'ready';
  }

  /** The link to a friend's live view of this build's list, while it can be shared. */
  get listUrl(): string | null {
    if (this.liveShare !== 'ready') {
      return null;
    }
    const { shortId, name } = this.currentBuild.value;
    return `${window.location.origin}${stillNeededPath(shortId!, name)}`;
  }

  signIn(): void {
    this.auth.signIn();
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
    const url = this.listUrl;
    if (url) {
      this.finishCopy(kind, Clipboard.copy(clipboardText(url)));
    }
  }

  private finishCopy(kind: ShoppingListCopyKind, succeeded: boolean): void {
    if (!succeeded) {
      this.copyError = 'Could not copy to the clipboard. Please try again.';
      this.cdr.markForCheck();
      return;
    }
    this.copyError = null;
    this.analytics.track('copy_shopping_list', { copy_kind: kind, needed_count: this.shoppingList.stillNeededKeys().length });
    this.justCopied = kind;
    this.cdr.markForCheck();
    clearTimeout(this.copiedTimeout);
    this.copiedTimeout = setTimeout(() => {
      this.justCopied = null;
      this.cdr.markForCheck();
    }, COPIED_CONFIRMATION_MS);
  }
}
