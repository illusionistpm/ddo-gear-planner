import { firstValueFrom, Observable } from 'rxjs';

import { groupBuildErrorOf, GroupsService } from '../build/groups.service';
import { AnalyticsService } from '../shared/analytics.service';
import { BuildChoice } from './build-choices.component';

/** The list being changed: its shortId, and the invite token adding to it takes. */
export interface EditedList {
  shortId: string;
  inviteToken: string;
}

/**
 * Puts your builds on a list of several builds and takes them off, and
 * renames their characters, a row of build choices at a time: for a list
 * in progress's Add builds, on its own page and on your build's list. Each
 * says on the row why it failed, and puts the tick back as it was.
 */
export class GroupBuildEditor {
  constructor(
    private readonly groups: GroupsService,
    private readonly analytics: AnalyticsService,
    private readonly list: EditedList,
    /** After a change has landed: whoever shows the list reads it again. */
    private readonly changed: () => void
  ) { }

  /** Adds the build to the list, or takes it off. The tick shows at once, and goes back if it fails. */
  async toggle(choice: BuildChoice, on: boolean): Promise<void> {
    const characterName = choice.characterName.trim();
    if (on && !characterName) {
      choice.error = 'Give the character a name.';
      return;
    }
    choice.inGroup = on;
    const done = await this.call(choice, on
      ? this.groups.addBuild(this.list.shortId, this.list.inviteToken, { buildId: choice.build.id, characterName })
      : this.groups.removeBuild(this.list.shortId, choice.build.id), on ? 'add_group_build' : 'remove_group_build');
    if (!done) {
      choice.inGroup = !on;
    } else if (on) {
      choice.savedName = characterName;
    }
  }

  /** Renames the build's character on the list, unless it's the name it has. */
  async rename(choice: BuildChoice): Promise<void> {
    const characterName = choice.characterName.trim();
    if (!characterName) {
      choice.error = 'Give the character a name.';
      return;
    }
    if (characterName === choice.savedName) {
      return;
    }
    if (await this.call(choice, this.groups.renameBuild(this.list.shortId, choice.build.id, characterName), 'rename_group_build')) {
      choice.savedName = characterName;
    }
  }

  private async call(choice: BuildChoice, request: Observable<unknown>, event: string): Promise<boolean> {
    choice.busy = true;
    choice.error = null;
    try {
      await firstValueFrom(request);
      this.analytics.track(event, {});
      this.changed();
      return true;
    } catch (error) {
      choice.error = groupBuildErrorOf(error);
      return false;
    } finally {
      choice.busy = false;
    }
  }
}
