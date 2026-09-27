// Pins what each tracked-affix chip shows - classes, text and tooltip - in both
// the category view and the scarcity ("Group by: Scarcity") view. Written
// before the two views' separate chip markup was merged into one.
//
// Driven through the rendered DOM, with covered affixes pushed through
// EquippedService.getCoveredAffixes() the way the real service delivers them,
// so these specs survive a rewrite of how the component builds its chips.

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { AppModule } from '../app.module';
import { AffixAvailabilityService, RemainingAvailability } from '../affixes/affix-availability.service';
import { affixTypeKey } from '../affixes/affix-type-key';
import { CoveredBonusType } from '../affixes/tracked-affix-derivation';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { EffectsTableComponent } from './effects-table.component';

describe('Tracked affix chips', () => {
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  const viewStateKeys = [
    'ddo-gear-planner-tracked-affix-group-mode',
    'ddo-gear-planner-tracked-affix-collapsed'
  ];

  let fixture: ComponentFixture<EffectsTableComponent>;
  let equipped: EquippedService;
  let coveredAffixes: BehaviorSubject<Map<string, CoveredBonusType[]>>;

  // Strength covers every value/ignore combination; the other affixes each
  // carry one availability outcome. Best values are keyed by affixTypeKey.
  const covered = new Map<string, CoveredBonusType[]>([
    ['Strength', [
      { bonusType: 'Enhancement', value: 5 },  // low, 1 place left
      { bonusType: 'Insight', value: 0 },      // uncovered, 7 places left
      { bonusType: 'Profane', value: 7 },      // sufficient (moderate)
      { bonusType: 'Quality', value: 0 },      // ignored, uncovered
      { bonusType: 'Sacred', value: 4 },       // ignored, low
      { bonusType: 'Exceptional', value: 8 },  // ignored, sufficient (max)
    ]],
    ['Dexterity', [{ bonusType: 'Artifact', value: 0 }]],     // set only
    ['Wisdom', [{ bonusType: 'Competence', value: 0 }]],      // ruled out
    ['Deathblock', [{ bonusType: 'Bool', value: 1 }]],        // checked
    ['Feather Falling', [{ bonusType: 'Bool', value: 0 }]],   // unchecked, 3 places left
  ]);
  const best = new Map<string, number>([
    [affixTypeKey('Strength', 'Enhancement'), 8],
    [affixTypeKey('Strength', 'Insight'), 4],
    [affixTypeKey('Strength', 'Profane'), 8],
    [affixTypeKey('Strength', 'Quality'), 3],
    [affixTypeKey('Strength', 'Sacred'), 8],
    [affixTypeKey('Strength', 'Exceptional'), 8],
    [affixTypeKey('Dexterity', 'Artifact'), 2],
    [affixTypeKey('Wisdom', 'Competence'), 5],
    [affixTypeKey('Deathblock', 'Bool'), 1],
    [affixTypeKey('Feather Falling', 'Bool'), 1],
  ]);
  const ignored = new Set([
    affixTypeKey('Strength', 'Quality'),
    affixTypeKey('Strength', 'Sacred'),
    affixTypeKey('Strength', 'Exceptional'),
  ]);
  const remaining = new Map<string, Partial<RemainingAvailability>>([
    [affixTypeKey('Strength', 'Enhancement'), { tier: 'scarce', slotCount: 1, eliminated: false }],
    [affixTypeKey('Strength', 'Insight'), { tier: 'common', slotCount: 7, eliminated: false }],
    [affixTypeKey('Dexterity', 'Artifact'), { tier: 'set-only', slotCount: 0, eliminated: false }],
    [affixTypeKey('Wisdom', 'Competence'), { tier: 'unavailable', slotCount: 0, eliminated: true }],
    [affixTypeKey('Feather Falling', 'Bool'), { tier: 'limited', slotCount: 3, eliminated: false }],
    [affixTypeKey('Water Breathing', 'Bool'), { tier: 'unavailable', slotCount: 0, eliminated: true }],
  ]);

  beforeEach(async () => {
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
    // Onboarding adds a "Click" badge to one chip; keep it out of the chip text.
    localStorage.setItem(onboardingStateKey, JSON.stringify({ completed: true, dismissed: true }));

    await TestBed.configureTestingModule({
      imports: [AppModule]
    }).compileComponents();

    const gearDB = TestBed.inject(GearDbService);
    vi.spyOn(gearDB, 'getAllLevelTypesForAffix').mockReturnValue([]);
    vi.spyOn(gearDB, 'getBestValueForAffixType').mockImplementation(
      (affixName: string, bonusType: string) => best.get(affixTypeKey(affixName, bonusType)) ?? 0);
    vi.spyOn(gearDB, 'getBestValueForAffix').mockReturnValue(8);

    equipped = TestBed.inject(EquippedService);
    coveredAffixes = new BehaviorSubject(covered);
    vi.spyOn(equipped, 'getCoveredAffixes').mockReturnValue(coveredAffixes);
    vi.spyOn(equipped, 'isAffixTypeIgnored').mockImplementation(
      (affixName: string, bonusType: string) => ignored.has(affixTypeKey(affixName, bonusType)));

    vi.spyOn(TestBed.inject(AffixAvailabilityService), 'getRemainingAvailability').mockImplementation(
      (affixName: string, bonusType: string) => ({ setSources: [], ...remaining.get(affixTypeKey(affixName, bonusType)) }) as RemainingAvailability);

    fixture = TestBed.createComponent(EffectsTableComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
    for (const key of viewStateKeys) {
      localStorage.removeItem(key);
    }
  });

  const text = (element: Element | null) => (element?.textContent ?? '').replace(/\s+/g, ' ').trim();
  // Chips are inline-flex, so whitespace between their spans never renders.
  const chipText = (element: Element) => text(element).replace(/ /g, '');

  /** The one bonus-type chip whose label reads `label`. */
  function chip(label: string): HTMLElement {
    const matches = (Array.from(fixture.nativeElement.querySelectorAll('button.tracked-bonus-chip')) as HTMLElement[])
      .filter(element => text(element.querySelector('.tracked-bonus-label')).replace(/:$/, '') === label);
    expect(matches.length).toBe(1);
    return matches[0];
  }

  /** The one checklist chip button for `affixName`. */
  function checklistChip(affixName: string): HTMLElement {
    const matches = (Array.from(fixture.nativeElement.querySelectorAll('button.checklist-chip-button')) as HTMLElement[])
      .filter(element => text(element.querySelector('.tracked-bonus-label')) === affixName);
    expect(matches.length).toBe(1);
    return matches[0];
  }

  /** The chip's modifier classes, minus the base class and the onboarding/pulse ones. */
  function modifiers(element: HTMLElement): string[] {
    return Array.from(element.classList)
      .filter(name => name !== 'tracked-bonus-chip' && name !== 'recently-changed')
      .sort();
  }

  // Both groupings show the same tooltip for the same bonus type: the value
  // summary, then how many places can still supply it while it is worth chasing.
  const tooltips: Record<string, string> = {
    Enhancement: 'Low value (3 below max)\nOnly 1 place can still supply this — fit it early.',
    Insight: 'Not covered yet (best available: 4)\n7 places can still supply this.',
    Profane: 'Moderate value (1 below max)',
    Quality: 'Marked as ignored',
    Sacred: 'Marked as ignored',
    Exceptional: 'Marked as ignored',
    Artifact: 'Not covered yet (best available: 2)\nNeeds a multi-piece set — no single item or augment supplies it.',
    Competence: 'Not covered yet (best available: 5)\nRuled out by your gear — no open slot, augment, or reachable set can still supply this.',
  };
  const checkedTooltip = 'Best possible value';
  const uncheckedTooltip = 'Not covered yet\n3 places can still supply this.';

  describe('in the category view', () => {
    it('shows value chips with their value class and max', () => {
      expect(chipText(chip('Enhancement'))).toBe('Enhancement:5/8');
      expect(modifiers(chip('Enhancement'))).toEqual(['low-value']);

      expect(chipText(chip('Profane'))).toBe('Profane:7/8');
      expect(modifiers(chip('Profane'))).toEqual(['mid-value']);
    });

    it('shows uncovered chips as no-value', () => {
      expect(chipText(chip('Insight'))).toBe('Insight/4');
      expect(modifiers(chip('Insight'))).toEqual(['no-value']);
    });

    it('strikes through ruled-out types, as the scarcity view does', () => {
      expect(modifiers(chip('Competence'))).toEqual(['bonus-eliminated', 'no-value']);
    });

    it('strikes through ignored chips, keeping their value class', () => {
      expect(modifiers(chip('Quality'))).toEqual(['bonus-ignored', 'no-value']);
      expect(modifiers(chip('Sacred'))).toEqual(['bonus-ignored', 'low-value']);
      expect(modifiers(chip('Exceptional'))).toEqual(['bonus-ignored', 'max-value']);
    });

    it('shows each chip\'s value and scarcity in its tooltip', () => {
      for (const [label, tooltip] of Object.entries(tooltips)) {
        expect(chip(label).title, label).toBe(tooltip);
      }
    });

    it('shows checklist affixes as checked or unchecked chips', () => {
      expect(checklistChip('Deathblock').title).toBe(checkedTooltip);
      expect(checklistChip('Deathblock').querySelector('.fa-square-check')).not.toBeNull();

      expect(checklistChip('Feather Falling').title).toBe(uncheckedTooltip);
      expect(checklistChip('Feather Falling').querySelector('.fa-square')).not.toBeNull();
    });
  });

  describe('in the scarcity view', () => {
    beforeEach(() => {
      equipped.setTrackedAffixGroupMode('slots');
      fixture.detectChanges();
    });

    it('shows the same chips as the category view', () => {
      expect(chipText(chip('Enhancement'))).toBe('Enhancement:5/8');
      expect(modifiers(chip('Enhancement'))).toEqual(['low-value']);
      expect(chipText(chip('Insight'))).toBe('Insight/4');
      expect(modifiers(chip('Insight'))).toEqual(['no-value']);
      expect(modifiers(chip('Profane'))).toEqual(['mid-value']);
    });

    it('shows the same tooltips as the category view', () => {
      for (const [label, tooltip] of Object.entries(tooltips)) {
        expect(chip(label).title, label).toBe(tooltip);
      }
    });

    it('strikes through ruled-out types', () => {
      expect(modifiers(chip('Competence'))).toEqual(['bonus-eliminated', 'no-value']);
    });

    it('strikes through ignored chips, keeping their value class', () => {
      expect(modifiers(chip('Quality'))).toEqual(['bonus-ignored', 'no-value']);
      expect(modifiers(chip('Sacred'))).toEqual(['bonus-ignored', 'low-value']);
    });

    it('files an ignored type that is already sufficient as fulfilled, still marked ignored', () => {
      expect(modifiers(chip('Exceptional'))).toEqual(['bonus-ignored', 'max-value']);
    });

    it('shows checked checklist affixes in the fulfilled row and unchecked ones as chips', () => {
      expect(checklistChip('Deathblock').title).toBe(checkedTooltip);

      expect(chipText(chip('Checklist'))).toBe('Checklist');
      expect(modifiers(chip('Checklist'))).toEqual(['no-value']);
      expect(chip('Checklist').title).toBe(uncheckedTooltip);
    });
  });

  describe('a ruled-out checklist affix', () => {
    const ruledOutTooltip = 'Not covered yet\nRuled out by your gear — no open slot, augment, or reachable set can still supply this.';

    beforeEach(() => {
      best.set(affixTypeKey('Water Breathing', 'Bool'), 1);
      coveredAffixes.next(new Map([['Water Breathing', [{ bonusType: 'Bool', value: 0 }]]]));
      fixture.detectChanges();
    });

    afterEach(() => {
      best.delete(affixTypeKey('Water Breathing', 'Bool'));
    });

    it('is struck through in the category view', () => {
      const wrap = checklistChip('Water Breathing').closest('.checklist-chip-wrap') as HTMLElement;
      expect(modifiers(wrap)).toEqual(['bonus-eliminated', 'checklist-chip-wrap', 'no-value']);
      expect(checklistChip('Water Breathing').title).toBe(ruledOutTooltip);
    });

    it('is struck through in the scarcity view', () => {
      equipped.setTrackedAffixGroupMode('slots');
      fixture.detectChanges();

      expect(modifiers(chip('Checklist'))).toEqual(['bonus-eliminated', 'no-value']);
      expect(chip('Checklist').title).toBe(ruledOutTooltip);
    });
  });

  describe('staying current', () => {
    it('rebuilds chips when covered affixes re-emit', () => {
      coveredAffixes.next(new Map([
        ['Strength', [{ bonusType: 'Enhancement', value: 8 }]],
      ]));
      fixture.detectChanges();

      expect(chipText(chip('Enhancement'))).toBe('Enhancement:8/8');
      expect(chip('Enhancement').title).toBe('Best possible value');
    });

    it('rebuilds chips when the level range changes the best available value', () => {
      best.set(affixTypeKey('Strength', 'Insight'), 6);
      try {
        TestBed.inject(FiltersService).setLevelRange(1, 20);
        fixture.detectChanges();

        expect(chipText(chip('Insight'))).toBe('Insight/6');
      } finally {
        best.set(affixTypeKey('Strength', 'Insight'), 4);
      }
    });
  });
});
