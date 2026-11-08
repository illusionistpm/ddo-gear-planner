import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';

import { BuildsService } from '../build/builds.service';
import {
  addBuildsOf, groupPath, GroupsService, inviteTokenOf, inviteUrlOf, MAX_GROUP_BUILDS, MAX_LIST_NAME_LENGTH
} from '../build/groups.service';
import { ListReturnService } from '../build/list-return.service';
import { MyListsService } from '../build/my-lists.service';
import { GroupCharacter, GroupRunService, GroupRunView } from '../planner/shopping-list/group-run.service';
import { ShoppingProgressStore } from '../planner/shopping-list/shopping-progress-store';
import { UserGearService } from '../planner/user-gear.service';
import { AnalyticsService } from '../shared/analytics.service';
import { PageChromeBack } from '../page-chrome/page-chrome.component';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';
import { BuildChoice, buildChoicesOf } from '../shopping-list/build-choices.component';
import { GroupBuildEditor } from '../shopping-list/group-build-editor';

const SITE_TITLE = 'DDO Gear Planner';

/**
 * A shopping list of several builds, at /list/:shortId#t=<invite token>
 * (`&add` opens Add builds): yours and friends', shopped for as one list,
 * each row saying which characters it's for. Anyone with the link watches
 * it live; signed in, they add their own saved builds and tick their own
 * characters' rows off. The host also arranges the shared route, takes
 * other people's builds off (in Manage builds), and from the menu at the
 * end of the Lists pill renames the list, replaces the link, and ends it.
 *
 * Like the still-needed page, it reads the builds itself and leaves the
 * planner as it was: its Planner link goes back to it.
 */
@Component({
  selector: 'app-group-run-page',
  templateUrl: './group-run-page.component.html',
  styleUrls: [
    '../still-needed-page/still-needed-page.component.css', '../shared/pill-button.css', '../shared/list-dialog-parts.css',
    './group-run-page.component.css'
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GroupRunService],
  standalone: false
})
export class GroupRunPageComponent implements OnInit, OnDestroy {
  /** The header's way back: the planner, as it was before this page. */
  readonly plannerLink: PageChromeBack;
  readonly maxBuilds = MAX_GROUP_BUILDS;
  readonly maxListNameLength = MAX_LIST_NAME_LENGTH;
  run: GroupRunView | null = null;
  shortId = '';
  token: string | null = null;
  signedIn = false;
  /** The Add builds panel is open, and your builds in it once they've loaded. */
  adding = false;
  choices: BuildChoice[] | null = null;
  choicesError: string | null = null;
  /** The host menu is open. */
  hostMenuOpen = false;
  /** Asking the host to confirm ending the group. */
  confirmingEnd = false;
  /** The other person's build the host is asked to confirm taking off; null for none. */
  confirmingRemove: string | null = null;
  /** Taking another person's build off failed: why. */
  othersError: string | null = null;
  /** The name the host is renaming the list to; null when not renaming. */
  newName: string | null = null;
  copied = false;
  /** Said once a host action fails. */
  actionError: string | null = null;
  private readonly subscriptions = new Subscription();
  private copiedTimeout?: ReturnType<typeof setTimeout>;
  /** Adds, takes off and renames your builds' characters, once the page has a link to the list. */
  private editor: GroupBuildEditor | null = null;
  /** The link asked for Add builds: opened once signed in. */
  private addWanted = false;

  constructor(
    readonly groupRun: GroupRunService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly groups: GroupsService,
    private readonly builds: BuildsService,
    private readonly auth: AuthService,
    private readonly analytics: AnalyticsService,
    private readonly title: Title,
    private readonly cdr: ChangeDetectorRef,
    private readonly userGear: UserGearService,
    listReturn: ListReturnService,
    private readonly progressStore: ShoppingProgressStore,
    private readonly myLists: MyListsService
  ) {
    this.plannerLink = { label: 'Planner', title: 'Back to the planner', url: listReturn.url };
  }

  ngOnInit(): void {
    // For Owned badges: reached from an invite link, the planner hasn't loaded the trove.
    this.userGear.loadFromStorage();
    this.shortId = this.route.snapshot.paramMap.get('shortId') ?? '';
    this.token = inviteTokenOf(this.route.snapshot.fragment);
    this.addWanted = !!this.token && addBuildsOf(this.route.snapshot.fragment);
    this.subscriptions.add(this.auth.isAuthenticated$.subscribe(signedIn => {
      this.signedIn = signedIn;
      if (signedIn && this.addWanted) {
        this.addWanted = false;
        if (!this.adding) {
          this.toggleAdding();
        }
      }
      this.cdr.markForCheck();
    }));
    if (!this.token) {
      this.title.setTitle(SITE_TITLE);
      return;
    }
    this.analytics.track('open_group_run', {});
    this.editor = new GroupBuildEditor(this.groups, this.analytics, { shortId: this.shortId, inviteToken: this.token },
      () => this.groupRun.refreshViewer());
    this.groupRun.open(this.shortId, this.token);
    this.subscriptions.add(this.groupRun.view$.subscribe(run => {
      this.run = run;
      this.title.setTitle(run.name ? `${run.name} - shopping list - ${SITE_TITLE}` : SITE_TITLE);
      this.syncChoices();
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.copiedTimeout);
    // Your ticks here go to the server directly: the planner's copy of the
    // build's catches up once the last of them has landed.
    void this.groupRun.flush().finally(() => this.progressStore.catchUp());
    // Builds may have been added or taken out, or the list ended: the planner's Rejoin follows.
    this.myLists.refresh();
  }

  get inviteUrl(): string {
    return inviteUrlOf(this.shortId, this.token ?? '');
  }

  get full(): boolean {
    return (this.run?.characters.length ?? 0) >= this.maxBuilds;
  }

  copyInvite(): void {
    this.copied = Clipboard.copy(this.inviteUrl);
    this.analytics.track('copy_group_invite', { copied: this.copied });
    clearTimeout(this.copiedTimeout);
    this.copiedTimeout = setTimeout(() => {
      this.copied = false;
      this.cdr.markForCheck();
    }, 2000);
  }

  signIn(): void {
    this.auth.signIn();
  }

  closeAdding(): void {
    this.adding = false;
    this.confirmingRemove = null;
    this.othersError = null;
    this.cdr.markForCheck();
  }

  toggleAdding(): void {
    this.adding = !this.adding;
    this.hostMenuOpen = false;
    if (this.adding && this.choices === null) {
      this.loadChoices();
    }
  }

  private loadChoices(): void {
    this.choicesError = null;
    this.builds.listMine().subscribe({
      next: builds => {
        this.choices = buildChoicesOf(builds);
        this.syncChoices();
        this.cdr.markForCheck();
      },
      error: () => {
        this.choicesError = 'Couldn\'t load your builds. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  /**
   * Marks the builds the group has, with the names they're on it as. A row
   * mid-change is left as it is (its tick shows the change ahead of the
   * group), and so is a name being typed.
   */
  private syncChoices(): void {
    const members = new Map((this.groupRun.group?.members ?? []).map(member => [member.buildId, member.characterName]));
    for (const choice of this.choices ?? []) {
      if (choice.busy) {
        continue;
      }
      const name = members.get(choice.build.id);
      if (name !== undefined && choice.characterName === choice.savedName) {
        // Added or renamed, here or elsewhere: show the name it's on the list as.
        choice.characterName = name;
      }
      choice.savedName = name ?? choice.savedName;
      choice.inGroup = name !== undefined;
    }
  }

  /** A row's tick: puts your build on the list, or takes it off. */
  async toggleBuild(choice: BuildChoice, on: boolean): Promise<void> {
    await this.editor?.toggle(choice, on);
    this.cdr.markForCheck();
  }

  /** A row's character name, once you've stopped typing it. */
  async renameBuild(choice: BuildChoice): Promise<void> {
    await this.editor?.rename(choice);
    this.cdr.markForCheck();
  }

  /** Other people's builds on the list, for the host to take off in Manage builds. */
  get others(): GroupCharacter[] {
    return (this.run?.characters ?? []).filter(character => !character.mine);
  }

  /** The host takes someone else's build off the list, once they've confirmed it. */
  async removeBuild(buildId: string): Promise<void> {
    this.othersError = null;
    try {
      await firstValueFrom(this.groups.removeBuild(this.shortId, buildId));
      this.analytics.track('remove_group_build', { own: false });
      this.groupRun.refreshViewer();
    } catch {
      this.othersError = 'Couldn\'t take that build off. Please try again.';
    } finally {
      this.confirmingRemove = null;
      this.cdr.markForCheck();
    }
  }

  toggleHostMenu(): void {
    this.hostMenuOpen = !this.hostMenuOpen;
    this.confirmingEnd = false;
    this.newName = null;
    this.adding = false;
  }

  closeHostMenu(): void {
    this.hostMenuOpen = false;
    this.confirmingEnd = false;
    this.newName = null;
  }

  /** Renames the list; everyone watching sees the new name as the group arrives again. */
  async renameList(): Promise<void> {
    const name = this.newName?.trim();
    if (!name) {
      return;
    }
    this.actionError = null;
    try {
      await firstValueFrom(this.groups.rename(this.shortId, name));
      this.analytics.track('rename_group', {});
      this.closeHostMenu();
    } catch {
      this.actionError = 'Couldn\'t rename the list. Please try again.';
    } finally {
      this.cdr.markForCheck();
    }
  }

  /** A new invite link: the old one stops working, and everyone watching through it is disconnected. */
  async replaceLink(): Promise<void> {
    this.actionError = null;
    try {
      const { inviteToken } = await firstValueFrom(this.groups.rotateInvite(this.shortId));
      this.analytics.track('rotate_group_invite', {});
      // A fresh page on the new link: the old one's socket has been closed.
      window.location.assign(groupPath(this.shortId, inviteToken));
    } catch {
      this.actionError = 'Couldn\'t replace the link. Please try again.';
      this.cdr.markForCheck();
    }
  }

  async endGroup(): Promise<void> {
    this.actionError = null;
    try {
      await firstValueFrom(this.groups.end(this.shortId));
      this.analytics.track('end_group_run', {});
      this.router.navigateByUrl('/');
    } catch {
      this.actionError = 'Couldn\'t end the list. Please try again.';
      this.cdr.markForCheck();
    }
  }
}
