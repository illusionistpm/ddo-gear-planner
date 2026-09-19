import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { AffixPickerComponent } from './affix-picker.component';
import { EquippedService } from '../equipped.service';

describe('AffixPickerComponent', () => {
  let component: AffixPickerComponent;
  let fixture: ComponentFixture<AffixPickerComponent>;
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  const legacyOnboardingKey = 'ddo-planner-onboarding-affix-type-opened';

  beforeEach(waitForAsync(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
  });

  beforeEach(() => {
    // Adding whole bundles would otherwise queue a lot of idle-time availability warmup that outlives the test.
    spyOn(TestBed.inject(EquippedService) as any, '_scheduleAvailabilityWarmup');
    fixture = TestBed.createComponent(AffixPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // State changes made straight on the component don't mark the fixture's view dirty on their own.
  function refreshView() {
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('pairs the starter package green cue with intro text and a skip action', () => {
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('.affix-next-chip')).not.toBeNull();
    expect(compiled.textContent).toContain('Pick the highlighted Basic package first');
    expect(compiled.querySelector('.onboarding-dismiss-button')?.textContent).toContain('Skip intro');
  });

  it('cues one additional build package after Basic is selected', () => {
    component.addPackage('Basic');

    expect(component.shouldHighlightEquipmentStep()).toBeFalse();
    expect(component.shouldHighlightStarterPackage('Melee')).toBeTrue();
    expect(component.shouldHighlightStarterPackage('Basic')).toBeFalse();
    expect(component.shouldShowAdditionalPackageHint()).toBeTrue();
  });

  it('pairs the equipment tab green cue with intro text after Basic and another package are selected', () => {
    component.addPackage('Basic');
    component.addPackage('Melee');

    expect(component.shouldHighlightEquipmentStep()).toBeTrue();
    expect(component.shouldShowAdditionalPackageHint()).toBeFalse();
    expect(component.shouldShowBasicPackageHint()).toBeFalse();
  });

  it('hides affix setup onboarding cues when dismissed', () => {
    component.dismissIntro();

    expect(component.onboardingActive).toBeFalse();
    expect(component.shouldShowBasicPackageHint()).toBeFalse();
    expect(component.shouldShowAdditionalPackageHint()).toBeFalse();
    expect(component.shouldHighlightEquipmentStep()).toBeFalse();
  });

  it('offers canonical affix names in spellpower bundles', () => {
    expect(component.spellpowerPackages.get('Healing')).toContain('Positive Spell Power');
    expect(component.spellpowerPackages.get('Healing')).not.toContain('Devotion');

    expect(component.spellpowerPackages.get('Cold')).toContain('Cold Lore');
    expect(component.spellpowerPackages.get('Cold')).toContain('Ice Intensity');
    expect(component.spellpowerPackages.get('Cold')).not.toContain('Ice Lore');
    expect(component.spellpowerPackages.get('Cold')).not.toContain('Cold Intensity');

    expect(component.spellpowerPackageKeys).toContain('Electric');
    expect(component.spellpowerPackageKeys).not.toContain('Lightning');
    expect(component.spellpowerPackages.get('Electric')).toContain('Electric Spell Power');
    expect(component.spellpowerPackages.get('Electric')).toContain('Lightning Lore');
    expect(component.spellpowerPackages.get('Electric')).toContain('Lightning Intensity');
    expect(component.spellpowerPackages.get('Electric')).not.toContain('Magnetism');
    expect(component.spellpowerPackages.get('Electric')).not.toContain('Electric Lore');
    expect(component.spellpowerPackages.get('Electric')).not.toContain('Electric Intensity');

    expect(component.spellpowerPackages.get('Light & Alignment')).toContain('Radiance');
    expect(component.spellpowerPackages.get('Light & Alignment')).toContain('Radiance Lore');
    expect(component.spellpowerPackages.get('Light & Alignment')).toContain('Radiance Intensity');
    expect(component.spellpowerPackages.get('Light & Alignment')).not.toContain('Light Spell Power');
    expect(component.spellpowerPackages.get('Light & Alignment')).not.toContain('Light Lore');
    expect(component.spellpowerPackages.get('Light & Alignment')).not.toContain('Light Intensity');

    expect(component.spellpowerPackages.get('Poison')).toContain('Poison Spell Power');
    expect(component.spellpowerPackages.get('Poison')).toContain('Poison Lore');
    expect(component.spellpowerPackages.get('Poison')).toContain('Void Intensity');

    expect(component.spellpowerPackages.get('Repair')).toContain('Repair Spell Power');
    expect(component.spellpowerPackages.get('Repair')).toContain('Rust Spell Power');
    expect(component.spellpowerPackages.get('Repair')).toContain('Repair');
    expect(component.spellpowerPackages.get('Repair')).not.toContain('Reconstruction');
  });

  it('uses individual saves and explicit sheltering affixes in the basic bundle', () => {
    expect(component.packages.get('Basic')).toContain('Fortitude Save');
    expect(component.packages.get('Basic')).toContain('Reflex Save');
    expect(component.packages.get('Basic')).toContain('Will Save');
    expect(component.packages.get('Basic')).toContain('Physical Sheltering');
    expect(component.packages.get('Basic')).toContain('Magical Sheltering');
    expect(component.packages.get('Basic')).not.toContain('Resistance');
    expect(component.packages.get('Basic')).not.toContain('Sheltering');
  });

  it('does not include universal spell affixes in the caster bundle', () => {
    expect(component.packages.get('Caster')).not.toContain('Universal Spell Power');
    expect(component.packages.get('Caster')).not.toContain('Universal Spell Lore');
    expect(component.packages.get('Caster')).not.toContain('Universal Spell Critical Damage');
    expect(component.packages.get('Caster')).toContain('Spellcraft');
    expect(component.packages.get('Caster')).toContain('Concentration');
  });

  it('shows tracked companion affixes immediately when an affix is added', () => {
    component.add('Armor Class');

    expect(component.savedSet.has('Armor Class')).toBeTrue();
    expect(component.savedSet.has('Armor Class (%)')).toBeTrue();
  });

  it('groups saved affixes for easier scanning', () => {
    component.savedSet.add('Strength');
    component.savedSet.add('Armor-Piercing');

    const groups = component.getSavedAffixGroups();

    expect(groups).toContain({ name: 'Attributes', affixes: ['Strength'] });
    expect(groups).toContain({ name: 'Offense', affixes: ['Armor-Piercing'] });
  });

  it('groups bool-only saved affixes with utility and checklist', () => {
    component.savedSet.add('Heroic Inspiration');

    expect(component.getSavedAffixGroups()).toContain({
      name: 'Utility & Checklist',
      affixes: ['Heroic Inspiration']
    });
  });

  it('includes Seeker in both the melee and ranged bundles', () => {
    expect(component.packages.get('Melee')).toContain('Seeker');
    expect(component.packages.get('Ranged')).toContain('Seeker');
  });

  it('adds a Trance insightful Deadly entry of 10 with the melee and ranged bundles', () => {
    const equipped = TestBed.inject(EquippedService);

    component.addPackage('Melee');

    const entries = equipped.getExternalAffixesForType('Deadly', 'Insightful');
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe('value');
    expect(entries[0].value).toBe(10);
    expect(entries[0].label).toBe('Trance');
  });

  it('keeps a value the user already entered instead of the suggested Trance entry', () => {
    const equipped = TestBed.inject(EquippedService);
    equipped.addExternalAffixValue('Deadly', 'Insightful', 20, 'Something else');

    component.addPackage('Ranged');

    const entries = equipped.getExternalAffixesForType('Deadly', 'Insightful');
    expect(entries.length).toBe(1);
    expect(entries[0].value).toBe(20);
    expect(entries[0].label).toBe('Something else');
  });

  it('keeps shared affixes and the Trance entry while another bundle still needs them', () => {
    const equipped = TestBed.inject(EquippedService);
    component.addPackage('Melee');
    component.addPackage('Ranged');

    component.addPackage('Melee');

    expect(component.isPackageSelected('Melee')).toBeFalse();
    expect(component.isPackageSelected('Ranged')).toBeTrue();
    expect(equipped.getExternalAffixesForType('Deadly', 'Insightful').length).toBe(1);

    component.addPackage('Ranged');

    expect(component.savedSet.has('Deadly')).toBeFalse();
    expect(equipped.getExternalAffixesForType('Deadly', 'Insightful').length).toBe(0);
  });

  it('leaves a Trance entry the user changed when the bundle is removed', () => {
    const equipped = TestBed.inject(EquippedService);
    component.addPackage('Melee');
    equipped.addExternalAffixValue('Deadly', 'Insightful', 15, 'Trance');

    component.addPackage('Melee');

    expect(equipped.getExternalAffixesForType('Deadly', 'Insightful').length).toBe(1);
  });

  it('keeps bundles highlighted for as long as the tracked affixes contain all of them', () => {
    const equipped = TestBed.inject(EquippedService);
    component.addPackage('Basic');
    component.addPackage('Caster');
    component.addSpellpower('Fire');

    // A freshly opened page has no memory of what was clicked - only what is tracked.
    const reopened = TestBed.createComponent(AffixPickerComponent).componentInstance;
    reopened.ngOnInit();

    expect(reopened.isPackageSelected('Basic')).toBeTrue();
    expect(reopened.isPackageSelected('Caster')).toBeTrue();
    expect(reopened.isSpellpowerSelected('Fire')).toBeTrue();
    expect(reopened.isPackageSelected('Melee')).toBeFalse();
    expect(reopened.showSpellSchools).toBeTrue();
    expect(reopened.showSpellpowers).toBeTrue();

    equipped.removeImportantAffix('Concentration');

    expect(reopened.isPackageSelected('Caster')).toBeFalse();
    expect(reopened.isPackageSelected('Basic')).toBeTrue();
  });

  it('marks spell schools and tactics selected, and toggles them off again', () => {
    component.addSpellSchool('Evocation');
    component.addTactic('Stunning');

    expect(component.isSpellSchoolSelected('Evocation')).toBeTrue();
    expect(component.isSpellSchoolSelected('Illusion')).toBeFalse();
    expect(component.isTacticSelected('Stunning')).toBeTrue();

    component.addSpellSchool('Evocation');
    component.addTactic('Stunning');

    expect(component.isSpellSchoolSelected('Evocation')).toBeFalse();
    expect(component.isTacticSelected('Stunning')).toBeFalse();
  });

  it('renders selected spell schools with the selected style', () => {
    component.addPackage('Caster');
    component.addSpellSchool('Evocation');
    refreshView();

    const chips = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.affix-selectable-chip.selected'));
    expect(chips.some(chip => chip.textContent?.trim() === 'Evocation')).toBeTrue();
  });

  it('labels selected affix chips as removable', () => {
    component.add('Strength');
    refreshView();

    const chip = (fixture.nativeElement as HTMLElement).querySelector('.selected-affix-chip')!;
    expect(chip.getAttribute('aria-label')).toBe('Remove Strength');
    expect(chip.querySelector('.selected-affix-chip-remove')).not.toBeNull();
  });

  it('clears saved affixes when tracked URL state is cleared', () => {
    const equipped = TestBed.inject(EquippedService);

    component.add('Strength');
    expect(component.savedSet.has('Strength')).toBeTrue();

    equipped.setImportantAffixes([]);

    expect(component.savedSet.size).toBe(0);
  });
});
