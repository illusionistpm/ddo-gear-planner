import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';

import { BuildSummary } from '../build/build';
import { BuildsService } from '../build/builds.service';
import {
  characterNameFor, groupBuildFailureOf, groupPath, GroupsService, inviteTokenOf, MAX_CHARACTER_NAME_LENGTH, MAX_GROUP_BUILDS
} from '../build/groups.service';
import { GroupRunService, GroupRunView } from '../planner/shopping-list/group-run.service';
import { UserGearService } from '../planner/user-gear.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';
import { ThemeService } from '../shared/theme.service';

const SITE_TITLE = 'DDO Gear Planner';

/** One of your saved builds, in the Add builds panel. */
interface BuildChoice {
  build: BuildSummary;
  /** The character name it's in the group as, or would be added as. */
  characterName: string;
  inGroup: boolean;
  busy: boolean;
  error: string | null;
}

/**
 * A group run's page, at /group/:shortId#t=<invite token>: several
 * friends' builds shopped for as one list, each row saying which
 * characters it's for. Anyone with the link watches it live; signed in,
 * they add their own saved builds and tick their own characters' rows off.
 * The host also arranges the shared route, replaces the link, and ends the
 * group.
 *
 * Like the still-needed page, it reads the builds itself and leaves the
 * planner as it was.
 */
@Component({
  selector: 'app-group-run-page',
  templateUrl: './group-run-page.component.html',
  styleUrls: ['../still-needed-page/still-needed-page.component.css', './group-run-page.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [GroupRunService],
  standalone: false
})
export class GroupRunPageComponent implements OnInit, OnDestroy {
  readonly maxBuilds = MAX_GROUP_BUILDS;
  readonly maxNameLength = MAX_CHARACTER_NAME_LENGTH;
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
  copied = false;
  /** Said once a host action fails. */
  actionError: string | null = null;
  private readonly subscriptions = new Subscription();
  private copiedTimeout?: ReturnType<typeof setTimeout>;

  constructor(
    readonly groupRun: GroupRunService,
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly groups: GroupsService,
    private readonly builds: BuildsService,
    private readonly auth: AuthService,
    private readonly analytics: AnalyticsService,
    private readonly title: Title,
    readonly theme: ThemeService,
    private readonly cdr: ChangeDetectorRef,
    private readonly userGear: UserGearService
  ) { }

  ngOnInit(): void {
    // For Owned badges: reached from an invite link, the planner hasn't loaded the trove.
    this.userGear.loadFromStorage();
    this.shortId = this.route.snapshot.paramMap.get('shortId') ?? '';
    this.token = inviteTokenOf(this.route.snapshot.fragment);
    this.subscriptions.add(this.auth.isAuthenticated$.subscribe(signedIn => {
      this.signedIn = signedIn;
      this.cdr.markForCheck();
    }));
    if (!this.token) {
      this.title.setTitle(SITE_TITLE);
      return;
    }
    this.analytics.track('open_group_run', {});
    this.groupRun.open(this.shortId, this.token);
    this.subscriptions.add(this.groupRun.view$.subscribe(run => {
      this.run = run;
      this.title.setTitle(run.name ? `${run.name} - group run - ${SITE_TITLE}` : SITE_TITLE);
      this.syncChoices();
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.copiedTimeout);
  }

  get inviteUrl(): string {
    return `${window.location.origin}${groupPath(this.shortId, this.token ?? '')}`;
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
        this.choices = builds.map(build => ({ build, characterName: characterNameFor(build.name), inGroup: false, busy: false, error: null }));
        this.syncChoices();
        this.cdr.markForCheck();
      },
      error: () => {
        this.choicesError = 'Couldn\'t load your builds. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  /** Marks the builds the group has, with the names they're in it as. */
  private syncChoices(): void {
    const members = new Map((this.groupRun.group?.members ?? []).map(member => [member.buildId, member.characterName]));
    for (const choice of this.choices ?? []) {
      const name = members.get(choice.build.id);
      if (name !== undefined && !choice.inGroup) {
        // Just added, here or elsewhere: show the name it's in the group as.
        choice.characterName = name;
      }
      choice.inGroup = name !== undefined;
    }
  }

  setCharacterName(choice: BuildChoice, value: string): void {
    choice.characterName = value;
    choice.error = null;
  }

  async addBuild(choice: BuildChoice): Promise<void> {
    const characterName = choice.characterName.trim();
    if (!characterName || !this.token) {
      choice.error = 'Give the character a name.';
      return;
    }
    await this.groupBuildCall(choice, () => this.groups.addBuild(this.shortId, this.token ?? '', { buildId: choice.build.id, characterName }),
      'add_group_build');
  }

  async renameBuild(choice: BuildChoice): Promise<void> {
    const characterName = choice.characterName.trim();
    if (!characterName) {
      choice.error = 'Give the character a name.';
      return;
    }
    await this.groupBuildCall(choice, () => this.groups.renameBuild(this.shortId, choice.build.id, characterName), 'rename_group_build');
  }

  async removeBuild(buildId: string, choice?: BuildChoice): Promise<void> {
    if (choice) {
      choice.busy = true;
    }
    this.actionError = null;
    try {
      await firstValueFrom(this.groups.removeBuild(this.shortId, buildId));
      this.analytics.track('remove_group_build', { own: !!choice });
      this.groupRun.refreshViewer();
    } catch {
      this.actionError = 'Couldn\'t take that build out. Please try again.';
    } finally {
      if (choice) {
        choice.busy = false;
      }
      this.cdr.markForCheck();
    }
  }

  private async groupBuildCall(choice: BuildChoice, call: () => ReturnType<GroupsService['addBuild']>, event: string): Promise<void> {
    choice.busy = true;
    choice.error = null;
    try {
      await firstValueFrom(call());
      this.analytics.track(event, {});
      this.groupRun.refreshViewer();
    } catch (error) {
      switch (groupBuildFailureOf(error)) {
        case 'name-taken':
          choice.error = 'A character in this group already has that name.';
          break;
        case 'full':
          choice.error = `A group run holds up to ${this.maxBuilds} builds.`;
          break;
        case 'already-in':
          choice.error = 'That build is in this group already.';
          break;
        default:
          choice.error = 'Couldn\'t save that. Please try again.';
      }
    } finally {
      choice.busy = false;
      this.cdr.markForCheck();
    }
  }

  toggleHostMenu(): void {
    this.hostMenuOpen = !this.hostMenuOpen;
    this.confirmingEnd = false;
    this.adding = false;
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
      this.actionError = 'Couldn\'t end the group run. Please try again.';
      this.cdr.markForCheck();
    }
  }
}
