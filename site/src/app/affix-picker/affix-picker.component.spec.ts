import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { AffixEditorService } from '../planner/affix-editor.service';
import { TypeaheadResult } from '../typeahead/typeahead.component';
import { AffixPickerComponent } from './affix-picker.component';
import { EquippedService } from '../planner/equipped.service';

describe('AffixPickerComponent', () => {
  let component: AffixPickerComponent;
  let fixture: ComponentFixture<AffixPickerComponent>;
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  const legacyOnboardingKey = 'ddo-planner-onboarding-affix-type-opened';

  beforeEach(async () => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    await TestBed.configureTestingModule({
      imports: [AppModule]
    })
      .compileComponents();
  });

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
  });

  beforeEach(() => {
    // Adding whole bundles would otherwise queue a lot of idle-time availability warmup that outlives the test.
    vi.spyOn(TestBed.inject(EquippedService) as any, '_scheduleAvailabilityWarmup').mockReturnValue(undefined);
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

    expect(component.shouldHighlightEquipmentStep()).toBe(false);
    expect(component.shouldHighlightStarterPackage('Melee')).toBe(true);
    expect(component.shouldHighlightStarterPackage('Basic')).toBe(false);
    expect(component.shouldShowAdditionalPackageHint()).toBe(true);
  });

  it('pairs the equipment tab green cue with intro text after Basic and another package are selected', () => {
    component.addPackage('Basic');
    component.addPackage('Melee');

    expect(component.shouldHighlightEquipmentStep()).toBe(true);
    expect(component.shouldShowAdditionalPackageHint()).toBe(false);
    expect(component.shouldShowBasicPackageHint()).toBe(false);
  });

  it('hides affix setup onboarding cues when dismissed', () => {
    component.dismissIntro();

    expect(component.onboardingActive).toBe(false);
    expect(component.shouldShowBasicPackageHint()).toBe(false);
    expect(component.shouldShowAdditionalPackageHint()).toBe(false);
    expect(component.shouldHighlightEquipmentStep()).toBe(false);
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
    expect(component.packages.get('Basic')).toContain('Immunity to Fear');
    expect(component.packages.get('Basic')).toContain('Undying');
    expect(component.packages.get('Basic')).not.toContain('Resistance');
    expect(component.packages.get('Basic')).not.toContain('Sheltering');
  });

  it('tracks each elemental absorption in the basic bundle rather than the group', () => {
    for (const element of ['Acid', 'Cold', 'Fire', 'Electric', 'Sonic']) {
      expect(component.packages.get('Basic')).toContain(`${element} Absorption`);
    }
    expect(component.packages.get('Basic')).not.toContain('Elemental Absorption');
  });

  it('tracks Enhanced Bloodrage in the melee bundle, not Blood Rage', () => {
    expect(component.packages.get('Melee')).toContain('Enhanced Bloodrage');
    expect(component.packages.get('Melee')).not.toContain('Blood Rage');
    expect(component.packages.get('Melee')).not.toContain('Bloodrage');
  });

  it('leaves what the basic bundle already tracks out of the melee and ranged bundles', () => {
    const basic = component.packages.get('Basic')!;

    expect(component.packages.get('Melee')!.filter(affix => basic.includes(affix))).toEqual([]);
    expect(component.packages.get('Ranged')!.filter(affix => basic.includes(affix))).toEqual([]);
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

    expect(component.savedSet.has('Armor Class')).toBe(true);
    expect(component.savedSet.has('Armor Class (%)')).toBe(true);
  });

  it('includes Seeker in both the melee and ranged bundles', () => {
    expect(component.packages.get('Melee')).toContain('Seeker');
    expect(component.packages.get('Ranged')).toContain('Seeker');
  });

  it('adds a Trance insightful Deadly entry of 10 with the melee and ranged bundles', () => {
    const equipped = TestBed.inject(EquippedService);

    component.addPackage('Melee');

    const entries = equipped.getExternalAffixesForType('Deadly', 'Insight');
    expect(entries.length).toBe(1);
    expect(entries[0].kind).toBe('value');
    expect(entries[0].value).toBe(10);
    expect(entries[0].label).toBe('Trance');
  });

  it('keeps a value the user already entered instead of the suggested Trance entry', () => {
    const equipped = TestBed.inject(EquippedService);
    equipped.addExternalAffixValue('Deadly', 'Insight', 20, 'Something else');

    component.addPackage('Ranged');

    const entries = equipped.getExternalAffixesForType('Deadly', 'Insight');
    expect(entries.length).toBe(1);
    expect(entries[0].value).toBe(20);
    expect(entries[0].label).toBe('Something else');
  });

  it('keeps shared affixes and the Trance entry while another bundle still needs them', () => {
    const equipped = TestBed.inject(EquippedService);
    component.addPackage('Melee');
    component.addPackage('Ranged');

    component.addPackage('Melee');

    expect(component.isPackageSelected('Melee')).toBe(false);
    expect(component.isPackageSelected('Ranged')).toBe(true);
    expect(equipped.getExternalAffixesForType('Deadly', 'Insight').length).toBe(1);

    component.addPackage('Ranged');

    expect(component.savedSet.has('Deadly')).toBe(false);
    expect(equipped.getExternalAffixesForType('Deadly', 'Insight').length).toBe(0);
  });

  it('leaves a Trance entry the user changed when the bundle is removed', () => {
    const equipped = TestBed.inject(EquippedService);
    component.addPackage('Melee');
    equipped.addExternalAffixValue('Deadly', 'Insight', 15, 'Trance');

    component.addPackage('Melee');

    expect(equipped.getExternalAffixesForType('Deadly', 'Insight').length).toBe(1);
  });

  it('keeps bundles highlighted for as long as the tracked affixes contain all of them', () => {
    const equipped = TestBed.inject(EquippedService);
    component.addPackage('Basic');
    component.addPackage('Caster');
    component.addSpellpower('Fire');

    // A freshly opened page has no memory of what was clicked - only what is tracked.
    const reopened = TestBed.createComponent(AffixPickerComponent).componentInstance;
    reopened.ngOnInit();

    expect(reopened.isPackageSelected('Basic')).toBe(true);
    expect(reopened.isPackageSelected('Caster')).toBe(true);
    expect(reopened.isSpellpowerSelected('Fire')).toBe(true);
    expect(reopened.isPackageSelected('Melee')).toBe(false);
    expect(reopened.showSpellSchools).toBe(true);
    expect(reopened.showSpellpowers).toBe(true);

    equipped.removeImportantAffix('Concentration');

    expect(reopened.isPackageSelected('Caster')).toBe(false);
    expect(reopened.isPackageSelected('Basic')).toBe(true);
  });

  it('marks spell schools and tactics selected, and toggles them off again', () => {
    component.addSpellSchool('Evocation');
    component.addTactic('Stunning');

    expect(component.isSpellSchoolSelected('Evocation')).toBe(true);
    expect(component.isSpellSchoolSelected('Illusion')).toBe(false);
    expect(component.isTacticSelected('Stunning')).toBe(true);

    component.addSpellSchool('Evocation');
    component.addTactic('Stunning');

    expect(component.isSpellSchoolSelected('Evocation')).toBe(false);
    expect(component.isTacticSelected('Stunning')).toBe(false);
  });

  it('renders selected spell schools with the selected style', () => {
    component.addPackage('Caster');
    component.addSpellSchool('Evocation');
    refreshView();

    const chips = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.affix-selectable-chip.selected'));
    expect(chips.some(chip => chip.textContent?.trim() === 'Evocation')).toBe(true);
  });

  const panelHeadings = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.affix-panel h3'))
    .map(heading => heading.textContent?.trim());

  it('puts the rows packages reveal right under Build Packages, and the affix search last', () => {
    component.addPackage('Melee');
    component.addPackage('Caster');
    refreshView();

    expect(panelHeadings()).toEqual(['Build Packages', 'Tactics', 'Spell Power', 'Spell Schools', 'Key Attributes', 'Find an affix']);
  });

  it('says under the search what a pick did', () => {
    const status = () => (fixture.nativeElement as HTMLElement).querySelector('.affix-search-status')?.textContent?.trim();
    TestBed.inject(EquippedService).setImportantAffixes([]);
    refreshView();
    expect(status()).toContain('Packages add whole sets');

    component.onChange()({ name: 'Doublestrike' } as TypeaheadResult);
    refreshView();
    expect(status()).toBe('Added Doublestrike');

    component.onChange()({ name: 'Doublestrike' } as TypeaheadResult);
    refreshView();
    expect(status()).toBe('Doublestrike is already tracked');
  });

  it('closes the editor from Done', () => {
    const editor = TestBed.inject(AffixEditorService);
    editor.open();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.affix-editor-foot .affix-editor-done')!.click();

    expect(editor.isOpen).toBe(false);
  });

  it('cues a spell power once Caster joins Basic, then the gear', () => {
    component.addPackage('Basic');
    component.addPackage('Caster');
    refreshView();

    expect(component.shouldShowSpellpowerHint()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Pick your spell power');

    component.addSpellpower('Fire');
    refreshView();

    expect(component.shouldShowSpellpowerHint()).toBe(false);
    expect(component.shouldHighlightEquipmentStep()).toBe(true);
  });

  // Characterization: what finishing and clearing do, pinned before the
  // controls for them move (the footer goes; Clear moves to the header).
  describe('finishing and clearing', () => {
    const button = (label: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'))
      .find(b => b.textContent?.replace(/\s+/g, ' ').trim().startsWith(label));

    it('finishing the gear-targets step closes the editor through AffixEditorService.finish', () => {
      const editor = TestBed.inject(AffixEditorService);
      const finish = vi.spyOn(editor, 'finish');
      editor.open();
      component.addPackage('Basic');
      component.addPackage('Melee');
      refreshView();
      expect(component.shouldHighlightEquipmentStep()).toBe(true);

      component.done();

      expect(finish).toHaveBeenCalled();
      expect(editor.isOpen).toBe(false);
    });

    it('clearing removes every tracked affix', () => {
      component.dismissIntro();
      component.addPackage('Basic');
      component.toggleAttribute('Strength');
      refreshView();
      expect(component.savedSet.size).toBeGreaterThan(0);

      component.clearAll();
      refreshView();

      expect(component.savedSet.size).toBe(0);
      expect(TestBed.inject(EquippedService).getImportantAffixes().size).toBe(0);
      expect(button('Clear')).toBeUndefined();
    });
  });

  it('clears saved affixes when tracked URL state is cleared', () => {
    const equipped = TestBed.inject(EquippedService);

    component.add('Strength');
    expect(component.savedSet.has('Strength')).toBe(true);

    equipped.setImportantAffixes([]);

    expect(component.savedSet.size).toBe(0);
  });
});
