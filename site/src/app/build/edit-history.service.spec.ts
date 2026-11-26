import { Component } from '@angular/core';
import { Location } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { EditHistoryService } from './edit-history.service';

@Component({ template: '' })
class BlankComponent { }

describe('EditHistoryService', () => {
  let history: EditHistoryService;
  let router: Router;
  let location: Location;

  const settle = () => TestBed.inject(ApplicationRef).whenStable();

  /** An edit, as QueryParamsService makes one. */
  async function edit(value: string, replaceUrl = false) {
    await router.navigate(['/'], { queryParams: { b: value }, replaceUrl, state: history.stateForNavigation(replaceUrl) });
    await settle();
  }

  async function step(move: () => boolean): Promise<boolean> {
    const moved = move();
    await settle();
    return moved;
  }

  const current = () => new URLSearchParams(location.path().split('?')[1] ?? '').get('b');

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '**', component: BlankComponent }]),
        provideLocationMocks()
      ]
    });
    router = TestBed.inject(Router);
    location = TestBed.inject(Location);
    history = TestBed.inject(EditHistoryService);
    await router.navigateByUrl('/my-builds');
    await router.navigateByUrl('/?b=start');
    await settle();
  });

  it('has nothing to undo or redo before an edit', () => {
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBe(false);
  });

  it('undoes edits back to where they started, never past it, and redoes them', async () => {
    await edit('one');
    await edit('two');

    expect(await step(() => history.undo())).toBe(true);
    expect(current()).toBe('one');
    expect(await step(() => history.undo())).toBe(true);
    expect(current()).toBe('start');
    // The page before the edits began is not an edit.
    expect(history.canUndo).toBe(false);
    expect(location.path()).toContain('b=start');

    expect(await step(() => history.redo())).toBe(true);
    expect(current()).toBe('one');
    expect(await step(() => history.redo())).toBe(true);
    expect(current()).toBe('two');
    expect(history.canRedo).toBe(false);
  });

  it('forgets the redo once a new edit is made after an undo', async () => {
    await edit('one');
    await edit('two');
    await step(() => history.undo());

    await edit('other');

    expect(history.canRedo).toBe(false);
    await step(() => history.undo());
    expect(current()).toBe('one');
  });

  it('keeps an entry undoable through a replace', async () => {
    await edit('one');
    await edit('renamed', true);

    expect(history.canUndo).toBe(true);
    await step(() => history.undo());
    expect(current()).toBe('start');
  });

  it('has no redo into history a visit to another page cut off', async () => {
    await edit('one');
    await step(() => history.undo());
    await router.navigateByUrl('/my-builds');
    await settle();
    location.back();
    await settle();

    expect(current()).toBe('start');
    expect(history.canRedo).toBe(false);
  });
});
