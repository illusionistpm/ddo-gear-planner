import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output
} from '@angular/core';
import { Subscription } from 'rxjs';

import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { buildPath } from '../build/build-route';
import { Clipboard } from '../shared/clipboard';
import { CurrentBuildState } from '../build/current-build.service';
import { EquippedService } from '../planner/equipped.service';
import { QueryParamsService } from '../build/query-params.service';
import { ShortLinksService } from '../build/short-links.service';

export type ShareCopyKind = 'link' | 'text-link' | 'text';

// 'canonical': the build's own existing /build/:shortId/:slug URL, shared
// as-is with no mint at all - only possible for a clean, owned, already-
// saved build (see canonicalShareUrl). 'short': a freshly minted immutable
// snapshot link (shortLinks.create) - what a dirty edit or a build the
// viewer doesn't own falls back to. 'long': the current ?b=... URL,
// unauthenticated visitors only (short links are locked behind sign-in).
export type ShareLinkKind = 'canonical' | 'short' | 'long';

// A copy click can land before the link resolves (the mint is a network
// round trip), and the menu needs to say so rather than silently doing
// nothing.
export type ShareLinkState =
  | { status: 'pending' }
  | { status: 'ready'; url: string; kind: ShareLinkKind }
  | { status: 'error'; message: string };

const COPIED_CONFIRMATION_MS = 1500;

/**
 * The open Share menu. It exists only while open, and resolves its link the
 * moment it opens (ngOnInit) rather than on the copy click: the copy itself
 * must stay synchronous inside the click's user gesture (see clipboard.ts),
 * and a network round trip between gesture and clipboard write silently
 * failed the write in Firefox/Safari.
 */
@Component({
  selector: 'app-build-share-menu',
  templateUrl: './build-share-menu.component.html',
  styleUrls: ['./build-share-menu.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class BuildShareMenuComponent implements OnInit, OnDestroy {
  @Input({ required: true }) buildState!: CurrentBuildState;
  @Input() isAuthenticated = false;
  @Output() closed = new EventEmitter<void>();

  shareLink: ShareLinkState = { status: 'pending' };
  // A copy that failed for a reason OTHER than the link not being ready yet
  // (shareLink.status === 'error' covers that one) - specifically,
  // Clipboard.copy() itself returning false.
  shareCopyError: string | null = null;
  // Transient "Copied!" confirmation - which action last copied something.
  justCopied: ShareCopyKind | null = null;

  private shareLinkSub?: Subscription;
  private copiedTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly shortLinks: ShortLinksService,
    private readonly queryParams: QueryParamsService,
    private readonly equipped: EquippedService,
    private readonly analytics: AnalyticsService,
    private readonly auth: AuthService,
    private readonly cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.resolveShareLink();
  }

  ngOnDestroy(): void {
    this.shareLinkSub?.unsubscribe();
    clearTimeout(this.copiedTimeout);
  }

  signIn(): void {
    this.auth.signIn();
  }

  // Three ways the link resolves, checked in order:
  //  1. Synchronously, to the build's own canonical URL - only for a clean,
  //     owned, already-saved build (see canonicalShareUrl).
  //  2. Synchronously, to the current long ?b=... URL - signed-out visitors
  //     only (window.location.href already reflects the current gear/name
  //     thanks to QueryParamsService.refreshLiveEditUrl()).
  //  3. Asynchronously, via a freshly minted short link - everything else.
  //     shareLink sits at 'pending' until then; a copy click that lands first
  //     is a no-op (see performShareCopy) rather than an async copy.
  private resolveShareLink(): void {
    const canonicalUrl = this.canonicalShareUrl();
    if (canonicalUrl) {
      this.shareLink = { status: 'ready', url: canonicalUrl, kind: 'canonical' };
      return;
    }
    if (!this.isAuthenticated) {
      this.shareLink = { status: 'ready', url: window.location.href, kind: 'long' };
      return;
    }

    this.shareLink = { status: 'pending' };
    this.shareLinkSub = this.shortLinks.create(this.queryParams.encodeCurrentBuild(), this.buildState.name ?? '').subscribe({
      next: ({ shortId }) => {
        this.shareLink = {
          status: 'ready',
          url: window.location.origin + buildPath(shortId, this.buildState.name),
          kind: 'short'
        };
        this.cdr.markForCheck();
      },
      error: () => {
        this.shareLink = { status: 'error', message: 'Could not create a share link. Please try again.' };
        this.cdr.markForCheck();
      }
    });
  }

  // A clean, owned, already-saved build's own URL always reflects its current
  // content - sharing it instead of minting a snapshot means recipients see
  // later saves, and avoids handing out a second, divergent URL for the same
  // build. (ownership can only be 'owned' for a signed-in viewer; the
  // isAuthenticated check states that invariant rather than leaning on it.)
  private canonicalShareUrl(): string | null {
    const { ownership, shortId, isDirty, name } = this.buildState;
    if (!this.isAuthenticated || ownership !== 'owned' || !shortId || isDirty) {
      return null;
    }
    return window.location.origin + buildPath(shortId, name);
  }

  // Only 'short' (a freshly minted snapshot) gets its own label - 'canonical'
  // and 'long' are both still "the link to this build".
  get shareLinkLabel(): string {
    if (this.shareLink.status === 'pending') {
      return 'Preparing link…';
    }
    return this.shareLink.status === 'ready' && this.shareLink.kind === 'short' ? 'Copy short link' : 'Copy link';
  }

  get shareTextAndLinkLabel(): string {
    return this.shareLink.status === 'pending' ? 'Preparing link…' : 'Copy text + link';
  }

  copyLink(): void {
    this.performShareCopy('link', url => url);
  }

  copyTextAndLink(): void {
    this.performShareCopy('text-link', url => `${this.equipped.getGearDescription()}\n${url}`);
  }

  copyTextOnly(): void {
    // No link involved - always available, whatever shareLink's state.
    this.finishShareCopy('text', Clipboard.copy(this.equipped.getGearDescription()));
  }

  private performShareCopy(kind: ShareCopyKind, buildClipboardText: (url: string) => string): void {
    if (this.shareLink.status !== 'ready') {
      // Still minting, or failed - the menu already shows that. Once it
      // resolves, a fresh click is the retry.
      return;
    }
    this.finishShareCopy(kind, Clipboard.copy(buildClipboardText(this.shareLink.url)));
  }

  private finishShareCopy(kind: ShareCopyKind, succeeded: boolean): void {
    if (!succeeded) {
      // Don't show "Copied!" or track a copy that didn't happen.
      this.shareCopyError = 'Could not copy to the clipboard. Please try again.';
      this.cdr.markForCheck();
      return;
    }
    this.shareCopyError = null;
    this.trackShareCopy(kind);
    this.justCopied = kind;
    this.cdr.markForCheck();
    clearTimeout(this.copiedTimeout);
    this.copiedTimeout = setTimeout(() => {
      this.justCopied = null;
      this.cdr.markForCheck();
    }, COPIED_CONFIRMATION_MS);
  }

  private trackShareCopy(kind: ShareCopyKind): void {
    const linkKind = kind === 'text' ? 'none' : (this.shareLink.status === 'ready' ? this.shareLink.kind : 'none');
    this.analytics.track('copy_build', {
      copy_kind: kind,
      link_kind: linkKind,
      equipped_slot_count: this.equipped.getEquippedItemCount()
    });
  }
}
