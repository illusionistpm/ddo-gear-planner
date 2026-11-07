import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom, Subscription } from 'rxjs';

import { BuildsService } from '../build/builds.service';
import { CurrentBuildService } from '../build/current-build.service';
import {
  characterNameFor, charactersListName, CreatedGroup, createListErrorOf, groupPath, groupRunName, GroupsService, GroupSummary,
  inviteUrlOf, MAX_GROUP_BUILDS, MAX_LIST_NAME_LENGTH, NewGroupBuild, uniqueListName
} from '../build/groups.service';
import { MyListsService } from '../build/my-lists.service';
import { AnalyticsService } from '../shared/analytics.service';
import { AuthService } from '../shared/auth.service';
import { Clipboard } from '../shared/clipboard';
import { BuildChoice, buildChoicesOf } from './build-choices.component';
import { GroupBuildEditor } from './group-build-editor';
import { LiveShare, liveShareOf } from './shopping-list-share-menu.component';

/** The two ways off your build's own list onto a list of several: your other builds, or friends'. */
export type ListAction = 'add' | 'invite';

/**
 * Your own list's actions, beside its title: Share; Add builds, for a list
 * of several of your builds; and Invite friends, for a list friends add
 * theirs to and shop from with you, live. Either list is a page of its own.
 *
 * Nothing is started until you say so: each opens a dialog, and closing it
 * leaves no list behind. Add builds lists your saved builds, this one first
 * and ticked, to start a list of the ones you tick. A build already on a
 * list is offered that list instead - the most recently active - where a
 * tick puts a build on it or takes it off at once, as on the list's own
 * page; or another list can be started. A new list needs a name,
 * prefilled with one none of your lists has.
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

  readonly maxListNameLength = MAX_LIST_NAME_LENGTH;

  /** The Share menu is open. */
  shareOpen = false;
  /** What an action needs first, while it says so under its button; null when closed. */
  needs: { action: ListAction; what: Exclude<LiveShare, 'ready'> } | null = null;
  /** The dialog open; null for none. */
  dialog: ListAction | null = null;
  /** The list the dialog changes or invites to; null to start a new one. */
  target: GroupSummary | null = null;
  /** A new list's name as typed; null until it is, for the default. */
  typedName: string | null = null;
  /** Your saved builds, in Add builds; null while they load. */
  choices: BuildChoice[] | null = null;
  choicesError: string | null = null;
  /** The list whose invite link Invite friends shows - one the build was on, or one just started; null until there is one. */
  invite: CreatedGroup | null = null;
  copied = false;
  /** A list is being started. */
  busy = false;
  /** Why the dialog's action failed, to say so. */
  error: string | null = null;
  private signedIn = false;
  private takenNames: readonly string[] = [];
  /** When Invite friends opened: what its default name is after. */
  private openedAt = new Date();
  /** Changes the target list's builds as they're ticked; null with no target. */
  private editor: GroupBuildEditor | null = null;
  /** How many builds the target list has, everyone's, as changed here. */
  private targetCount = 0;
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

  /** The build on screen, which the lists are started from. */
  get currentBuildId(): string | null {
    return this.currentBuild.value.savedBuildId;
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
    this.needs = null;
    this.dialog = action;
    this.typedName = null;
    this.error = null;
    this.copied = false;
    this.openedAt = new Date();
    this.setTarget(this.myLists.listFor(this.currentBuildId));
    this.invite = action === 'invite' ? this.target : null;
    if (action === 'add') {
      this.loadChoices();
    }
  }

  close(): void {
    this.dialog = null;
    this.choices = null;
    this.cdr.markForCheck();
  }

  /** Starts a new list rather than using the one the build is on: this build ticked, the rest not. */
  startNew(): void {
    this.setTarget(null);
    this.invite = null;
    this.error = null;
    for (const choice of this.choices ?? []) {
      choice.inGroup = false;
      choice.picked = choice.build.id === this.currentBuildId;
      choice.error = null;
    }
  }

  /** The new list's name: as typed, or one from who's on it that none of your lists has. */
  get listName(): string {
    if (this.typedName !== null) {
      return this.typedName;
    }
    const base = this.dialog === 'invite'
      ? groupRunName(this.openedAt)
      : charactersListName(this.picked().map(choice => choice.characterName.trim()).filter(Boolean));
    return uniqueListName(base, this.takenNames);
  }

  /** How many builds a new list would start with. */
  get pickedCount(): number {
    return this.picked().length;
  }

  /** The list is full, or would be with those ticked: no more are offered. */
  get full(): boolean {
    return (this.target ? this.targetCount : this.pickedCount) >= MAX_GROUP_BUILDS;
  }

  get inviteUrl(): string {
    return this.invite ? inviteUrlOf(this.invite.shortId, this.invite.inviteToken) : '';
  }

  /** On the list the build is on: a row's tick puts that build on it or takes it off, at once. */
  async toggleOnTarget(choice: BuildChoice, on: boolean): Promise<void> {
    const wasOn = choice.inGroup;
    await this.editor?.toggle(choice, on);
    this.targetCount += Number(choice.inGroup) - Number(wasOn);
    this.cdr.markForCheck();
  }

  /** On the list the build is on: a row's character name, once you've stopped typing it. */
  async renameOnTarget(choice: BuildChoice): Promise<void> {
    await this.editor?.rename(choice);
    this.cdr.markForCheck();
  }

  /** Starts a list of the builds ticked, and goes there. */
  async startPicked(): Promise<void> {
    const picked = this.picked();
    if (this.busy || !this.namesValid(picked)) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      const group = await this.create('add_builds', picked.map(choice => ({ buildId: choice.build.id, characterName: choice.characterName.trim() })));
      if (group) {
        await this.router.navigateByUrl(groupPath(group.shortId, group.inviteToken));
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
      const characterName = characterNameFor(this.currentBuild.value.name ?? '') || 'Me';
      this.invite = await this.create('invite_friends', [{ buildId: this.currentBuildId ?? '', characterName }]);
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

  /** Goes to the list the dialog is about: the one Invite friends showed, or the one Add builds changed. */
  async goToList(): Promise<void> {
    const list = this.invite ?? this.target;
    if (list) {
      await this.router.navigateByUrl(groupPath(list.shortId, list.inviteToken));
    }
  }

  signIn(): void {
    this.auth.signIn();
  }

  backToPlanner(): void {
    this.needs = null;
    this.toPlanner.emit();
  }

  private setTarget(target: GroupSummary | null): void {
    this.target = target;
    this.targetCount = target?.buildCount ?? 0;
    this.editor = target && new GroupBuildEditor(this.groups, this.analytics, target, () => this.myLists.refresh());
  }

  private loadChoices(): void {
    this.choices = null;
    this.choicesError = null;
    this.builds.listMine().subscribe({
      next: builds => {
        this.choices = buildChoicesOf(builds, this.currentBuildId);
        // Your builds on the list already, ticked; there are no others to start one with.
        const onTarget = new Set(this.target?.yourBuildIds ?? []);
        for (const choice of this.choices) {
          choice.inGroup = onTarget.has(choice.build.id);
        }
        this.cdr.markForCheck();
      },
      error: () => {
        this.choicesError = 'Couldn\'t load your builds. Please try again.';
        this.cdr.markForCheck();
      }
    });
  }

  private picked(): BuildChoice[] {
    return (this.choices ?? []).filter(choice => choice.picked);
  }

  /**
   * Whether a new list has a name, builds, and a different name for each
   * build's character, saying which doesn't: the Worker refuses a new list
   * whose names clash without saying which.
   */
  private namesValid(picked: readonly BuildChoice[]): boolean {
    this.error = !this.listName.trim() ? 'Give the list a name.'
      : this.dialog === 'add' && !picked.length ? 'Tick the builds to put on the list.'
        : null;
    let valid = !this.error;
    const seen = new Set<string>();
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
}
