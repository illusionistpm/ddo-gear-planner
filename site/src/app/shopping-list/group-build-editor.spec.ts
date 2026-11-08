import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';

import { GroupsService } from '../build/groups.service';
import { AnalyticsService } from '../shared/analytics.service';
import { BuildChoice, buildChoicesOf } from './build-choices.component';
import { GroupBuildEditor } from './group-build-editor';

describe('GroupBuildEditor', () => {
  let groups: { addBuild: ReturnType<typeof vi.fn>; removeBuild: ReturnType<typeof vi.fn>; renameBuild: ReturnType<typeof vi.fn> };
  let changed: ReturnType<typeof vi.fn<() => void>>;
  let editor: GroupBuildEditor;
  let choice: BuildChoice;

  beforeEach(() => {
    groups = { addBuild: vi.fn(() => of({})), removeBuild: vi.fn(() => of(undefined)), renameBuild: vi.fn(() => of({})) };
    changed = vi.fn();
    editor = new GroupBuildEditor(groups as unknown as GroupsService, { track: vi.fn() } as unknown as AnalyticsService,
      { shortId: 'grp1', inviteToken: 'tok' }, changed);
    [choice] = buildChoicesOf([{ id: 'b1', shortId: 's1', name: 'Tank build' }]);
  });

  it('puts a build on the list as its character, and takes it off', async () => {
    choice.characterName = ' Kira ';
    await editor.toggle(choice, true);

    expect(groups.addBuild).toHaveBeenCalledWith('grp1', 'tok', { buildId: 'b1', characterName: 'Kira' });
    expect([choice.inGroup, choice.savedName]).toEqual([true, 'Kira']);

    await editor.toggle(choice, false);
    expect(groups.removeBuild).toHaveBeenCalledWith('grp1', 'b1');
    expect(choice.inGroup).toBe(false);
    expect(changed).toHaveBeenCalledTimes(2);
  });

  it('puts the tick back, saying why, when that fails', async () => {
    groups.addBuild.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { full: true } })));

    await editor.toggle(choice, true);

    expect(choice.inGroup).toBe(false);
    expect(choice.error).toBe('A list holds up to 12 builds.');
    expect(choice.busy).toBe(false);
    expect(changed).not.toHaveBeenCalled();
  });

  it('won\'t add a character with no name', async () => {
    choice.characterName = '  ';

    await editor.toggle(choice, true);

    expect(choice.error).toBe('Give the character a name.');
    expect(groups.addBuild).not.toHaveBeenCalled();
  });

  it('renames a character only when the name has changed', async () => {
    choice.inGroup = true;
    await editor.rename(choice);
    expect(groups.renameBuild).not.toHaveBeenCalled();

    choice.characterName = 'Kira';
    await editor.rename(choice);
    expect(groups.renameBuild).toHaveBeenCalledWith('grp1', 'b1', 'Kira');
    expect(choice.savedName).toBe('Kira');

    groups.renameBuild.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 409, error: { nameTaken: true } })));
    choice.characterName = 'Vex';
    await editor.rename(choice);
    expect(choice.error).toBe('A character on this list already has that name.');
    expect([choice.characterName, choice.savedName]).toEqual(['Vex', 'Kira']);
  });
});
