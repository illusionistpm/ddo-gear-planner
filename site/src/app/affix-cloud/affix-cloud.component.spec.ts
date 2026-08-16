import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { AffixCloudComponent } from './affix-cloud.component';
import { EquippedService } from '../equipped.service';

describe('AffixCloudComponent', () => {
  let component: AffixCloudComponent;
  let fixture: ComponentFixture<AffixCloudComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AffixCloudComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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
