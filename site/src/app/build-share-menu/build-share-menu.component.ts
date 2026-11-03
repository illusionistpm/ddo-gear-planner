import {
  ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output
} from '@angular/core';
import { Subscription } from 'rxjs';

import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';
import { CurrentBuildState } from '../build/current-build.service';
import { EquippedService } from '../planner/equipped.service';
import { ShareLinkResolverService, ShareLinkState } from '../build/share-link-resolver.service';

export type ShareCopyKind = 'link' | 'text-link' | 'text';

const COPIED_CONFIRMATION_MS = 1500;

/**
 * The open Share menu. It exists only while open, and resolves its link the
 * moment it opens (ngOnInit) rather than on the copy click - see
 * ShareLinkResolverService for why.
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
    private readonly shareLinks: ShareLinkResolverService,
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

  private resolveShareLink(): void {
    this.shareLinkSub = this.shareLinks.resolve(this.buildState, this.isAuthenticated).subscribe(shareLink => {
      this.shareLink = shareLink;
      this.cdr.markForCheck();
    });
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
