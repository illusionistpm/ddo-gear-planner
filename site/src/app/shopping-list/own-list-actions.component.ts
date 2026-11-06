import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';

import { CurrentBuildService } from '../build/current-build.service';
import { characterNameFor, groupPath, GroupsService } from '../build/groups.service';
import { MyListsService } from '../build/my-lists.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { LiveShare, liveShareOf } from './shopping-list-share-menu.component';

/**
 * Your own list's actions, beside its title: Share, and Add builds, which
 * makes it a list of several builds - yours, and friends' you invite - on
 * a page of its own. That holds saved builds only, as it's how the site
 * learns of your others: until this one is a saved build of yours as
 * saved, Add builds says what it takes.
 */
@Component({
  selector: 'app-own-list-actions',
  templateUrl: './own-list-actions.component.html',
  styleUrls: ['../shared/share-menu.css', './own-list-actions.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class OwnListActionsComponent implements OnInit, OnDestroy {
  /** The list has something on it to share. */
  @Input() hasItems = false;
  /** Back to the planner, to save the build first. */
  @Output() toPlanner = new EventEmitter<void>();

  /** The Share menu is open. */
  shareOpen = false;
  /** What Add builds needs first, while it says so; null when closed. */
  needs: Exclude<LiveShare, 'ready'> | null = null;
  /** A list is being started. */
  starting = false;
  /** Starting one failed: why, to say so. */
  error: string | null = null;
  private signedIn = false;
  private readonly subscription = new Subscription();

  constructor(
    private readonly currentBuild: CurrentBuildService,
    private readonly groups: GroupsService,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly analytics: AnalyticsService,
    private readonly cdr: ChangeDetectorRef,
    private readonly myLists: MyListsService
  ) { }

  ngOnInit(): void {
    this.subscription.add(this.auth.isAuthenticated$.subscribe(signedIn => {
      this.signedIn = signedIn;
      this.cdr.markForCheck();
    }));
    // Saved, or found to be yours, while the list is open.
    this.subscription.add(this.currentBuild.state$.subscribe(() => this.cdr.markForCheck()));
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  toggleShare(): void {
    this.shareOpen = !this.shareOpen;
    this.needs = null;
  }

  @HostListener('document:keydown.escape')
  closeMenus(): void {
    this.shareOpen = false;
    this.needs = null;
    this.cdr.markForCheck();
  }

  /**
   * Starts a list with this build in it, as a character named after the
   * build (renamed on the list's page), and goes there to add the rest -
   * or, until it can, says what that takes.
   */
  async addBuilds(): Promise<void> {
    this.shareOpen = false;
    const live = liveShareOf(this.signedIn, this.currentBuild.value);
    if (live !== 'ready') {
      this.needs = this.needs === live ? null : live;
      this.analytics.track('add_builds_blocked', { needs: live });
      return;
    }
    const { savedBuildId, name } = this.currentBuild.value;
    if (!savedBuildId || this.starting) {
      return;
    }
    const onList = this.myLists.listFor(savedBuildId);
    if (onList) {
      // Already on one: add the rest there, rather than starting another.
      this.analytics.track('rejoin_list', { from: 'add_builds' });
      await this.router.navigateByUrl(groupPath(onList.shortId, onList.inviteToken, { add: true }));
      return;
    }
    this.starting = true;
    this.error = null;
    try {
      const characterName = characterNameFor(name ?? '') || 'Me';
      const group = await firstValueFrom(this.groups.create('', [{ buildId: savedBuildId, characterName }]));
      this.analytics.track('start_group_run', {});
      await this.router.navigateByUrl(groupPath(group.shortId, group.inviteToken, { add: true }));
    } catch {
      this.error = 'Couldn\'t start a list of several builds. Please try again.';
    } finally {
      this.starting = false;
      this.cdr.markForCheck();
    }
  }

  signIn(): void {
    this.auth.signIn();
  }

  backToPlanner(): void {
    this.needs = null;
    this.toPlanner.emit();
  }
}
