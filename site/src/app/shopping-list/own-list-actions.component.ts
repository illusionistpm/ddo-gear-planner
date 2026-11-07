import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';

import { BuildsService } from '../build/builds.service';
import { CurrentBuildService } from '../build/current-build.service';
import {
  characterNameFor, charactersListName, CreatedGroup, createListErrorOf, groupBuildErrorOf, groupPath, groupRunName, GroupsService, GroupSummary,
  inviteUrlOf, MAX_CHARACTER_NAME_LENGTH, MAX_GROUP_BUILDS, MAX_LIST_NAME_LENGTH, NewGroupBuild, uniqueListName
} from '../build/groups.service';
import { MyListsService } from '../build/my-lists.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';
import { BuildChoice, buildChoicesOf } from './build-choices.component';
import { LiveShare, liveShareOf } from './shopping-list-share-menu.component';

/** The two ways off your build's own list onto a list of several: your other builds, or friends'. */
export type ListAction = 'add' | 'invite';

/**
 * Your own list's actions, beside its title: Share; Add builds, for a list
 * of several of your builds; and Invite friends, for a list friends add
 * theirs to and shop from with you, live. Either list is a page of its own.
 *
 * Nothing is started until you say so: each opens a dialog, and closing it
 * leaves no list behind. A build already on a list is offered that list -
 * the most recently active - with a way to start another instead; a new
 * one needs a name, prefilled with one none of your lists has.
 *
 * Lists hold saved builds only, as that's how the site learns of your
 * others: until this one is a saved build of yours as saved, each says what
 * it takes.
 */
@Component({
  selector: 'app-own-list-actions',
  templateUrl: './own-list-actions.component.html',
  styleUrls: ['../shared/share-menu.css', '../shared/pill-button.css', '../shared/list-dialog-parts.css', './own-list-actions.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: false
})
export class OwnListActionsComponent implements OnInit, OnDestroy {
  /** The list has something on it to share. */
  @Input() hasItems = false;
  /** Back to the planner, to save the build first. */
  @Output() toPlanner = new EventEmitter<void>();

  readonly maxCharacterNameLength = MAX_CHARACTER_NAME_LENGTH;
  readonly maxListNameLength = MAX_LIST_NAME_LENGTH;

  /** The Share menu is open. */
  shareOpen = false;
  /** What an action needs first, while it says so under its button; null when closed. */
  needs: { action: ListAction; what: Exclude<LiveShare, 'ready'> } | null = null;
  /** The dialog open; null for none. */
  dialog: ListAction | null = null;
  /** The list the dialog adds to or invites to; null to start a new one. */
  target: GroupSummary | null = null;
  /** This build's character name on a new list. */
  characterName = '';
  /** A new list's name as typed; null until it is, for the default. */
  typedName: string | null = null;
  /** Your other builds, in Add builds; null while they load. */
  choices: BuildChoice[] | null = null;
  choicesError: string | null = null;
  /** The list whose invite link Invite friends shows - one the build was on, or one just started; null until there is one. */
  invite: CreatedGroup | null = null;
  copied = false;
  /** A list is being started or added to. */
  busy = false;
  /** Why the dialog's action failed, to say so. */
  error: string | null = null;
  private signedIn = false;
  private takenNames: readonly string[] = [];
  /** When Invite friends opened: what its default name is after. */
  private openedAt = new Date();
  private readonly subscription = new Subscription();

  constructor(
    private readonly currentBuild: CurrentBuildService,
    private readonly groups: GroupsService,
    private readonly builds: BuildsService,
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
    this.subscription.add(this.myLists.lists$.subscribe(lists => {
      this.takenNames = lists.map(list => list.name);
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  toggleShare(): void {
    this.shareOpen = !this.shareOpen;
    this.needs = null;
  }

  /** Opens Add builds or Invite friends - or, until it can, says what that takes. */
  open(action: ListAction): void {
    this.shareOpen = false;
    const live = liveShareOf(this.signedIn, this.currentBuild.value);
    if (live !== 'ready') {
      this.needs = this.needs?.action === action && this.needs.what === live ? null : { action, what: live };
      this.analytics.track('add_builds_blocked', { needs: live, action });
      return;
    }
    const { savedBuildId, name } = this.currentBuild.value;
    this.needs = null;
    this.dialog = action;
    this.characterName = characterNameFor(name ?? '') || 'Me';
    this.typedName = null;
    this.error = null;
    this.copied = false;
    this.openedAt = new Date();
    this.target = this.myLists.listFor(savedBuildId);
    this.invite = action === 'invite' ? this.target : null;
    if (action === 'add') {
      this.loadChoices(savedBuildId);
    }
  }

  close(): void {
    this.dialog = null;
    this.choices = null;
    this.cdr.markForCheck();
  }

  /** Starts a new list rather than using the one the build is on. */
  startNew(): void {
    this.target = null;
    this.invite = null;
    this.error = null;
    this.markOnTarget();
  }

  /** The new list's name: as typed, or one from who's on it that none of your lists has. */
  get listName(): string {
    if (this.typedName !== null) {
      return this.typedName;
    }
    const base = this.dialog === 'invite'
      ? groupRunName(this.openedAt)
      : charactersListName([this.characterName, ...this.picked().map(choice => choice.characterName)].map(name => name.trim()).filter(Boolean));
    return uniqueListName(base, this.takenNames);
  }

  /** How many builds Add builds would add. */
  get pickedCount(): number {
    return this.picked().length;
  }

  /** The list would be full with those added: no more are offered. */
  get full(): boolean {
    const onList = this.target ? this.target.buildCount : 1;
    return onList + this.pickedCount >= MAX_GROUP_BUILDS;
  }

  get inviteUrl(): string {
    return this.invite ? inviteUrlOf(this.invite.shortId, this.invite.inviteToken) : '';
  }

  /** Adds the builds picked: to the list the build is on, or to a new one with this build. */
  async addPicked(): Promise<void> {
    const picked = this.picked();
    if (!picked.length || this.busy) {
      this.error = picked.length ? null : 'Tick the builds to add.';
      return;
    }
    if (!this.namesValid(picked)) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      if (this.target) {
        await this.addTo(this.target, picked);
      } else {
        const group = await this.create('add_builds', [this.thisBuild(), ...picked.map(choice => this.memberOf(choice))]);
        if (group) {
          await this.router.navigateByUrl(groupPath(group.shortId, group.inviteToken));
        }
      }
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /** Starts a list with this build on it, and shows its invite link to copy. */
  async startInvite(): Promise<void> {
    if (this.busy || !this.namesValid([])) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      this.invite = await this.create('invite_friends', [this.thisBuild()]);
    } finally {
      this.busy = false;
      this.cdr.markForCheck();
    }
  }

  /** Copies the invite link, within the click. */
  copyInvite(): void {
    this.copied = Clipboard.copy(this.inviteUrl);
    this.analytics.track('copy_group_invite', { copied: this.copied, from: 'own_list' });
    if (!this.copied) {
      this.error = 'Couldn\'t copy the link. Copy it from the box instead.';
    }
  }

  /** Goes to the list Invite friends showed. */
  async openInvited(): Promise<void> {
    if (this.invite) {
      await this.router.navigateByUrl(groupPath(this.invite.shortId, this.invite.inviteToken));
    }
  }

  signIn(): void {
    this.auth.signIn();
  }

  backToPlanner(): void {
    this.needs = null;
    this.toPlanner.emit();
  }

  private loadChoices(savedBuildId: string | null): void {
    this.choices = null;
    this.choicesError = null;
    this.builds.listMine().subscribe({
      next: builds => {
        this.choices = buildChoicesOf(builds.filter(build => build.id !== savedBuildId));
        this.markOnTarget();
        this.cdr.markForCheck();
      },
      error: () => {
        this.choicesError = 'Couldn\'t load your builds. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  /** Marks your builds already on the list being added to, which aren't offered again. */
  private markOnTarget(): void {
    const onTarget = new Set(this.target?.yourBuildIds ?? []);
    for (const choice of this.choices ?? []) {
      choice.inGroup = onTarget.has(choice.build.id);
      choice.picked &&= !choice.inGroup;
    }
  }

  private picked(): BuildChoice[] {
    return (this.choices ?? []).filter(choice => choice.picked && !choice.inGroup);
  }

  private thisBuild(): NewGroupBuild {
    return { buildId: this.currentBuild.value.savedBuildId ?? '', characterName: this.characterName.trim() };
  }

  private memberOf(choice: BuildChoice): NewGroupBuild {
    return { buildId: choice.build.id, characterName: choice.characterName.trim() };
  }

  /**
   * Whether every character to add has a name, and a different one from
   * the rest, saying which doesn't: the Worker refuses a new list whose
   * names clash without saying which. On a list already, it says so per build.
   */
  private namesValid(picked: readonly BuildChoice[]): boolean {
    let valid = true;
    if (!this.target && !this.listName.trim()) {
      this.error = 'Give the list a name.';
      valid = false;
    } else if (!this.target && !this.characterName.trim()) {
      this.error = 'Give this build\'s character a name.';
      valid = false;
    }
    const seen = new Set(this.target ? [] : [this.characterName.trim().toLowerCase()]);
    for (const choice of picked) {
      const name = choice.characterName.trim().toLowerCase();
      choice.error = !name ? 'Give the character a name.' : seen.has(name) ? 'Each character needs a different name.' : null;
      valid &&= !choice.error;
      seen.add(name);
    }
    return valid;
  }

  /** Starts a list with these builds under the name given, remembering it as yours; null, saying why, if it couldn't be. */
  private async create(from: string, members: NewGroupBuild[]): Promise<CreatedGroup | null> {
    try {
      const group = await firstValueFrom(this.groups.create(this.listName.trim(), members));
      this.myLists.added(group, members);
      this.analytics.track('start_group_run', { from, builds: members.length });
      return group;
    } catch (error) {
      this.error = createListErrorOf(error);
      return null;
    }
  }

  /** Adds the builds to a list one at a time, stopping at one that can't be, and goes there once all are. */
  private async addTo(list: GroupSummary, picked: readonly BuildChoice[]): Promise<void> {
    for (const choice of picked) {
      try {
        await firstValueFrom(this.groups.addBuild(list.shortId, list.inviteToken, this.memberOf(choice)));
        choice.inGroup = true;
        choice.picked = false;
      } catch (error) {
        choice.error = groupBuildErrorOf(error);
        this.myLists.refresh();
        return;
      }
    }
    this.analytics.track('add_to_list', { builds: picked.length });
    this.myLists.refresh();
    await this.router.navigateByUrl(groupPath(list.shortId, list.inviteToken));
  }
}
