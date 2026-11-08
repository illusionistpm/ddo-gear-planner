import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';

import { EquippedService } from '../planner/equipped.service';
import { GearDbService } from '../gear/gear-db.service';
import { AffixService } from '../affixes/affix.service';
import { buildAffixTypeaheadEntries } from '../affixes/affix-typeahead';
import { AnalyticsService } from '../shared/analytics.service';
import { PlannerOnboardingService } from '../planner/planner-onboarding.service';
import { AffixPackagesService } from '../affixes/affix-packages.service';
import { AffixEditorService } from '../planner/affix-editor.service';

import { TypeaheadEntry, TypeaheadResult } from '../typeahead/typeahead.component';

@Component({
    selector: 'app-affix-picker',
    templateUrl: './affix-picker.component.html',
    styleUrls: ['./affix-picker.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class AffixPickerComponent implements OnInit, OnDestroy {
  savedSet: Set<string>;
  spellSchools: Array<string>;
  tactics: Array<string>;

  showTactics: boolean = false;
  showSpellpowers: boolean = false;
  showSpellSchools: boolean = false;

  public allAffixes: TypeaheadEntry[];

  attributes = ['Strength', 'Dexterity', 'Constitution', 'Intelligence', 'Wisdom', 'Charisma'];
  packages: Map<string, Array<string>>;
  packageKeys: string[];

  spellpowerPackages: Map<string, Array<string>>;
  spellpowerPackageKeys: string[];
  onboardingActive = true;
  basicPackageHint = true;
  additionalPackageHint = false;
  equipmentStepHint = false;
  spellpowerHint = false;

  private importantAffixesSubscription?: Subscription;
  private onboardingSubscription?: Subscription;

  constructor(
    public equipped: EquippedService,
    public gearDB: GearDbService,
    private affixSvc: AffixService,
    private analytics: AnalyticsService,
    private onboarding: PlannerOnboardingService,
    private affixPackages: AffixPackagesService,
    private editor: AffixEditorService
  ) {
    this.savedSet = new Set<string>();

    this.allAffixes = buildAffixTypeaheadEntries(this.gearDB.getAllAffixes(), this.affixSvc);

    this.spellSchools = ['Evocation', 'Transmutation', 'Abjuration', 'Conjuration', 'Enchantment', 'Illusion', 'Necromancy'];
    this.tactics = ['Stunning', 'Sundering', 'Vertigo'];

    this.packages = this.affixPackages.packages;
    this.packageKeys = this.affixPackages.packageKeys;
    this.spellpowerPackages = this.affixPackages.spellpowerPackages;
    this.spellpowerPackageKeys = this.affixPackages.spellpowerPackageKeys;
  }

  ngOnInit() {
    this.importantAffixesSubscription = this.equipped.getImportantAffixesObservable()
      .subscribe(affixes => this.syncFromImportantAffixes(affixes));
    this.onboardingActive = this.onboarding.shouldShowOnboarding();
    this.onboardingSubscription = this.onboarding.getOnboardingState().subscribe(() => {
      this.onboardingActive = this.onboarding.shouldShowOnboarding();
      this.refreshOnboardingHints();
    });
    this.refreshOnboardingHints();
  }

  ngOnDestroy() {
    this.importantAffixesSubscription?.unsubscribe();
    this.onboardingSubscription?.unsubscribe();
  }

  toggleAttribute(attr: string) {
    if (this.isAttributeSelected(attr)) {
      this.remove(attr);
      return;
    }

    this.add(attr, 'attribute_button');
  }

  isAttributeSelected(attr: string) {
    return this.savedSet.has(attr);
  }

  addPackage(pkg: string) {
    if (this.isPackageSelected(pkg)) {
      this.removePackage(pkg);
      return;
    }

    this.analytics.track('select_affix_package', {
      package_type: 'basic',
      package_name: pkg
    });
    this.affixPackages.addPackage(pkg);
  }

  addTactic(tactic: string) {
    if (this.isTacticSelected(tactic)) {
      this.remove(tactic);
      return;
    }

    this.add(tactic, 'tactic_button');
  }

  isTacticSelected(tactic: string) {
    return this.savedSet.has(tactic);
  }

  addSpellSchool(spellSchool: string) {
    if (this.isSpellSchoolSelected(spellSchool)) {
      this.remove(this.getSpellSchoolAffix(spellSchool));
      return;
    }

    this.add(this.getSpellSchoolAffix(spellSchool), 'spell_school_button');
  }

  isSpellSchoolSelected(spellSchool: string) {
    return this.savedSet.has(this.affixSvc.getCanonicalName(this.getSpellSchoolAffix(spellSchool)));
  }

  private getSpellSchoolAffix(spellSchool: string) {
    return spellSchool + ' Focus';
  }

  addSpellpower(spellpower: string) {
    if (this.isSpellpowerSelected(spellpower)) {
      this.removeSpellpower(spellpower);
      return;
    }

    this.analytics.track('select_affix_package', {
      package_type: 'spellpower',
      package_name: spellpower
    });
    this.affixPackages.addSpellpower(spellpower);
  }

  removePackage(pkg: string) {
    this.affixPackages.removePackage(pkg);
  }

  removeSpellpower(spellpower: string) {
    this.affixPackages.removeSpellpower(spellpower);
  }

  isPackageSelected(pkg: string) {
    return this.affixPackages.isSelected(this.packages.get(pkg), this.savedSet);
  }

  shouldHighlightStarterPackage(pkg: string) {
    if (this.shouldShowBasicPackageHint()) {
      return pkg === 'Basic';
    }

    return this.shouldShowAdditionalPackageHint() && pkg !== 'Basic';
  }

  shouldShowBasicPackageHint() {
    return this.basicPackageHint;
  }

  shouldShowAdditionalPackageHint() {
    return this.additionalPackageHint;
  }

  shouldHighlightEquipmentStep() {
    return this.equipmentStepHint;
  }

  /** Caster is on but says nothing yet about which spells: the next step is a spell power. */
  shouldShowSpellpowerHint() {
    return this.spellpowerHint;
  }

  /** Any of the intro's steps is showing - each comes with Next step and Skip intro. */
  hasOnboardingStep() {
    return this.basicPackageHint || this.additionalPackageHint || this.spellpowerHint || this.equipmentStepHint;
  }

  dismissIntro() {
    this.onboarding.dismissIntro();
    this.onboardingActive = this.onboarding.shouldShowOnboarding();
    this.refreshOnboardingHints();
  }

  isSpellpowerSelected(spellpower: string) {
    return this.affixPackages.isSelected(this.spellpowerPackages.get(spellpower), this.savedSet);
  }

  getPackageTooltip(pkg: string) {
    return this.getPackageAffixesTooltip(this.packages.get(pkg));
  }

  getSpellpowerTooltip(spellpower: string) {
    return this.getPackageAffixesTooltip(this.spellpowerPackages.get(spellpower));
  }

  add(affix: string, source: string = 'manual_search', track: boolean = true) {
    const addedAffixes = this.equipped.addImportantAffix(affix);
    if (track && addedAffixes.length) {
      this.analytics.track('select_affix', {
        selection_source: source,
        added_affix_count: addedAffixes.length
      });
    }
    for (const addedAffix of addedAffixes) {
      this.savedSet.add(addedAffix);
    }
    if (!addedAffixes.length && this.equipped.isImportantAffix(affix)) {
      this.savedSet.add(affix);
    }
  }

  private syncFromImportantAffixes(affixes: Set<string>) {
    this.savedSet = new Set(affixes);
    this.updateConditionalSections();
    this.refreshOnboardingHints();
  }

  remove(affix: string) {
    const removedAffixes = this.equipped.removeImportantAffix(affix);
    for (const removedAffix of removedAffixes) {
      this.savedSet.delete(removedAffix);
    }
  }

  clearAll() {
    for (const affix of Array.from(this.savedSet)) {
      this.remove(affix);
    }
    this.updateConditionalSections();
    this.refreshOnboardingHints();
  }

  onChange() {
    return (affix: TypeaheadResult) => {
      this.add('original' in affix ? affix.original : affix.name, 'manual_search');
    };
  }

  done() {
    this.editor.finish();
  }

  private updateConditionalSections() {
    this.showTactics = this.isPackageSelected('Melee');
    this.showSpellpowers = this.isPackageSelected('Caster') || this.spellpowerPackageKeys.some(key => this.isSpellpowerSelected(key));
    this.showSpellSchools = this.isPackageSelected('Caster');
  }

  private hasAdditionalStarterPackage() {
    return this.packageKeys.some(pkg => pkg !== 'Basic' && this.isPackageSelected(pkg));
  }

  private getPackageAffixesTooltip(affixes: string[] | undefined) {
    if (!affixes || !affixes.length) {
      return '';
    }

    return 'Adds: ' + affixes.join(', ');
  }

  private refreshOnboardingHints() {
    const basicSelected = this.isPackageSelected('Basic');
    this.basicPackageHint = this.onboardingActive && !basicSelected;
    this.additionalPackageHint = this.onboardingActive && basicSelected && !this.hasAdditionalStarterPackage();
    const starterChosen = this.onboardingActive && basicSelected && this.hasAdditionalStarterPackage();
    this.spellpowerHint = starterChosen && this.isPackageSelected('Caster')
      && !this.spellpowerPackageKeys.some(key => this.isSpellpowerSelected(key));
    this.equipmentStepHint = starterChosen && !this.spellpowerHint;
  }
}
