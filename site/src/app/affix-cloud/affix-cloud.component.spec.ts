import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { AffixCloudComponent } from './affix-cloud.component';
import { EquippedService } from '../equipped.service';

describe('AffixCloudComponent', () => {
  let component: AffixCloudComponent;
  let fixture: ComponentFixture<AffixCloudComponent>;
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
    fixture = TestBed.createComponent(AffixCloudComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders non-production admin access in the workspace bar', () => {
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('.affix-workspace-bar app-admin-link')).not.toBeNull();
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
    expect(component.packages.get('Caster')).toContain('Spellcraft');
    expect(component.packages.get('Caster')).toContain('Spell Focus Mastery');
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

  it('clears saved affixes when tracked URL state is cleared', () => {
    const equipped = TestBed.inject(EquippedService);

    component.add('Strength');
    expect(component.savedSet.has('Strength')).toBeTrue();
    expect(component.topResults.length).toBeGreaterThan(0);

    equipped.setImportantAffixes([]);

    expect(component.savedSet.size).toBe(0);
    expect(component.topResults.length).toBe(0);
  });
});
