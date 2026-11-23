import { TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { EquippedService } from '../planner/equipped.service';
import { GoalUndoService } from './goal-undo.service';
import { UndoOffer, UndoService } from './undo.service';

describe('GoalUndoService', () => {
  let equipped: EquippedService;
  let goalUndo: GoalUndoService;
  let undo: UndoService;
  let offer: UndoOffer | null;

  const goals = () => [...equipped.getImportantAffixes()].sort();

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AppModule] });
    equipped = TestBed.inject(EquippedService);
    goalUndo = TestBed.inject(GoalUndoService);
    undo = TestBed.inject(UndoService);
    undo.offer$.subscribe(value => offer = value);
    equipped.setImportantAffixes(['Strength', 'Fortification']);
  });

  it('removes a goal and puts the list back as it was on Undo', () => {
    const before = goals();

    goalUndo.remove('Strength');
    expect(goals()).not.toContain('Strength');
    expect(offer?.message).toBe('Removed goal: Strength');

    undo.undo();
    expect(goals()).toEqual(before);
  });

  it('offers nothing for a goal that isn\'t on the list', () => {
    goalUndo.remove('Doublestrike');

    expect(offer).toBeNull();
  });

  it('withdraws the offer once the list changes again, so Undo never discards a later edit', () => {
    goalUndo.remove('Strength');
    equipped.addImportantAffix('Doublestrike');

    expect(offer).toBeNull();
    expect(goals()).toContain('Doublestrike');
  });
});
