import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, OnDestroy, Output } from '@angular/core';

import { buildPath } from '../build/build-route';
import { CurrentBuildService } from '../build/current-build.service';
import { shoppingListFragment } from '../build/shopping-list-link';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import { AnalyticsService } from '../shared/analytics.service';
import { Clipboard } from '../shared/clipboard';

export type ShoppingListCopyKind = 'link' | 'text_and_link' | 'text';

const COPIED_CONFIRMATION_MS = 1500;

/**
 * The shopping list's open Share menu: a link that opens a friend's view of
 * what's still needed, that with the list as text, or the text alone.
 *
 * The link follows the owner's ticks, which only the server can carry, so
 * it's offered for a saved build of yours. Any other build gets the text
 * alone: a list that couldn't change after copying would be just that.
 */
@Component({
  selector: 'app-shopping-list-share-menu',
  templateUrl: './shopping-list-share-menu.component.html',
  styleUrls: ['./shopping-list-share-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class ShoppingListShareMenuComponent implements OnDestroy {
  @Output() closed = new EventEmitter<void>();

  /** Clipboard.copy() refused. */
  copyError: string | null = null;
  /** Which item last copied something, for its "Copied!". */
  justCopied: ShoppingListCopyKind | null = null;

  private copiedTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly shoppingList: ShoppingListService,
    private readonly currentBuild: CurrentBuildService,
    private readonly analytics: AnalyticsService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnDestroy(): void {
    clearTimeout(this.copiedTimeout);
  }

  /** The link to a friend's view of this build's list, or null when it can't have one. */
  get listUrl(): string | null {
    const { shortId, name, ownership } = this.currentBuild.value;
    if (!shortId || ownership !== 'owned') {
      return null;
    }
    return `${window.location.origin}${buildPath(shortId, name)}#${shoppingListFragment({ kind: 'live' })}`;
  }

  /** A friend's link shows the build as saved, not the changes on screen. */
  get hasUnsavedChanges(): boolean {
    return this.currentBuild.value.isDirty;
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
