import { LowerCasePipe, NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';

import { AffixDescriptionService } from '../affixes/affix-description.service';
import { AffixPackagesService, DAMAGE_BOOSTS } from '../affixes/affix-packages.service';
import { FILIGREE_TRACKING_MIN_LEVEL, getMaxFiligreeSlots } from '../affixes/filigree-affix';
import { GearDescriptionComponent } from '../gear-description/gear-description.component';
import { BuildSummary } from '../build/build';
import { gearSummaryLabel } from '../build/build-gear-summary';
import { buildPath } from '../build/build-route';
import { BuildsService } from '../build/builds.service';
import { QueryParamsService } from '../build/query-params.service';
import { PackChecklistComponent } from '../filters/pack-checklist.component';
import { PackChecklistModel } from '../filters/pack-checklist-model';
import { GameDataService } from '../gear/game-data.service';
import { GearDbService } from '../gear/gear-db.service';
import {
  BODY_ARMOR_TYPES, DOCENT_TYPE, ItemTypeFamily, MELEE_WEAPON_FAMILIES, MELEE_WEAPON_TYPES, OFFHAND_FAMILIES,
  RANGED_WEAPON_FAMILIES, RANGED_WEAPON_TYPES
} from '../gear/item-type-groups';
import { RankedArtifact, rankArtifacts } from '../planner/artifact-ranking';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { AuthService } from '../shared/auth.service';
import {
  ATTRIBUTES, BuildRole, LEVELLING_RANGE, NewBuildAnswers, SPELL_SCHOOLS, TACTICS, TranceChoice,
  emptyAnswers, greenSteelAffix, greenSteelChoices, isTwoHandedOnly, levelRangeOf, tranceDeadlyFor, withRole
} from './new-build-plan';
import { NewBuildService } from './new-build.service';

export type StartStep = 'role' | 'sources' | 'weapons' | 'armor' | 'stats' | 'trance' | 'extras' | 'artifact' | 'summary';

const STEP_LABELS: Record<StartStep, string> = {
  role: 'Role',
  sources: 'Gear sources',
  weapons: 'Weapons',
  armor: 'Armor',
  stats: 'Stats',
  trance: 'Trance',
  extras: 'Extras',
  artifact: 'Artifact',
  summary: 'Summary'
};

const ALL_STEPS = Object.keys(STEP_LABELS) as StartStep[];
const RECENT_BUILDS = 5;
const ARTIFACTS_SHOWN = 5;

interface ArtifactRow {
  ranked: RankedArtifact;
  filigree: number;
  /** GearDescriptionComponent's inputs: editable, so its crafting can change before it's chosen. */
  inputs: { item: RankedArtifact['item']; readonly: false; equipOnChange: false };
}

/**
 * The start page's body: the landing (sign in, your builds, start one) at
 * /start, and the guided setup's steps at /start#role, #weapons and so on.
 * Every step can be skipped, and "Finish now" is always there; see
 * NewBuildService for how the answers reach the planner.
 */
@Component({
  selector: 'app-start-flow',
  templateUrl: './start-flow.component.html',
  styleUrls: ['./start-flow.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [LowerCasePipe, NgComponentOutlet, PackChecklistComponent]
})
export class StartFlowComponent implements OnInit, OnDestroy {
  readonly labels = STEP_LABELS;
  readonly attributes = ATTRIBUTES;
  readonly schools = SPELL_SCHOOLS;
  readonly tactics = TACTICS;
  readonly damageBoosts = DAMAGE_BOOSTS;
  /**
   * How the suggestion drawer shows an item. Declared in the eager AppModule, so it's
   * rendered with ngComponentOutlet rather than imported here.
   */
  readonly gearDescription = GearDescriptionComponent;
  readonly offhandFamilies = OFFHAND_FAMILIES;
  readonly bodyArmorTypes = BODY_ARMOR_TYPES;
  readonly docentType = DOCENT_TYPE;
  readonly spellpowers: string[];
  readonly maxLevel: number;

  /** null on the landing; a step while setting up. */
  step: StartStep | null = null;
  answers: NewBuildAnswers = emptyAnswers();

  authReady = false;
  signedIn = false;
  builds: BuildSummary[] | null = null;
  buildsFailed = false;
  showAllBuilds = false;

  /** "Only packs I own" is chosen: the checklist shows, though every pack may be ticked. */
  ownsPacks = false;
  /** The packs came from this browser's last setup. */
  packsRemembered = false;

  artifacts: ArtifactRow[] | null = null;
  showAllArtifacts = false;

  private setupStarted = false;
  private levellingRange: [number, number] = LEVELLING_RANGE;
  private packModel?: PackChecklistModel;
  private rankingRun = 0;
  private readonly subscriptions = new Subscription();

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
    private readonly auth: AuthService,
    private readonly buildsService: BuildsService,
    private readonly newBuild: NewBuildService,
    private readonly queryParams: QueryParamsService,
    private readonly equipped: EquippedService,
    private readonly gearDB: GearDbService,
    private readonly gameData: GameDataService,
    private readonly affixDescriptions: AffixDescriptionService,
    filters: FiltersService,
    affixPackages: AffixPackagesService
  ) {
    this.spellpowers = affixPackages.spellpowerPackageKeys;
    this.maxLevel = filters.getMaxLevel();
  }

  ngOnInit(): void {
    this.subscriptions.add(this.route.fragment.subscribe(fragment => this.show(fragment)));
    // The Green Steel effects say what they do.
    void this.affixDescriptions.load().then(() => this.cdr.markForCheck());
    this.subscriptions.add(combineLatest([this.auth.isLoading$, this.auth.isAuthenticated$]).subscribe(([loading, signedIn]) => {
      this.authReady = !loading;
      this.signedIn = signedIn;
      if (!loading && signedIn && this.builds === null && !this.buildsFailed) {
        this.loadBuilds();
      }
      this.cdr.markForCheck();
    }));
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.rankingRun++;
  }

  // The landing

  get shownBuilds(): BuildSummary[] {
    const builds = this.builds ?? [];
    return this.showAllBuilds ? builds : builds.slice(0, RECENT_BUILDS);
  }

  get hiddenBuildCount(): number {
    return Math.max(0, (this.builds?.length ?? 0) - this.shownBuilds.length);
  }

  buildLabel(build: BuildSummary): string {
    return gearSummaryLabel(build.summary);
  }

  buildLink(build: BuildSummary): string {
    return buildPath(build.shortId, build.name);
  }

  loadBuilds(): void {
    this.buildsFailed = false;
    this.buildsService.listMine().subscribe({
      next: builds => {
        this.builds = [...builds].sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
        this.cdr.markForCheck();
      },
      error: () => {
        this.buildsFailed = true;
        this.cdr.markForCheck();
      }
    });
  }

  openBuild(build: BuildSummary, event: Event): void {
    event.preventDefault();
    void this.router.navigateByUrl(this.buildLink(build));
  }

  signIn(): void {
    this.auth.signIn();
  }

  startGuided(): void {
    this.goTo('role');
  }

  openBlankBuild(): void {
    this.newBuild.clearAnswers();
    void this.router.navigateByUrl('/');
  }

  // Moving between steps

  get steps(): StartStep[] {
    return ALL_STEPS.filter(step => {
      if (step === 'trance') {
        return this.isMartial;
      }
      if (step === 'artifact') {
        return this.levelRange[1] >= FILIGREE_TRACKING_MIN_LEVEL;
      }
      return true;
    });
  }

  stepLabel(step: StartStep): string {
    return step === 'weapons' && this.answers.role === 'caster' ? 'Offhand' : this.labels[step];
  }

  get stepIndex(): number {
    return this.step ? this.steps.indexOf(this.step) : -1;
  }

  goTo(step: StartStep | null): void {
    void this.router.navigate([], { relativeTo: this.route, fragment: step ?? undefined });
  }

  next(): void {
    const steps = this.steps;
    this.goTo(steps[Math.min(steps.length - 1, this.stepIndex + 1)]);
  }

  back(): void {
    this.goTo(this.stepIndex > 0 ? this.steps[this.stepIndex - 1] : null);
  }

  startPlanning(): void {
    this.rankingRun++;
    this.newBuild.apply(this.answers);
    void this.newBuild.handOff();
  }

  private show(fragment: string | null): void {
    const step = ALL_STEPS.includes(fragment as StartStep) ? fragment as StartStep : null;
    if (step && !this.setupStarted) {
      this.setupStarted = true;
      this.answers = this.newBuild.loadAnswers() ?? this.freshAnswers();
      this.ownsPacks = this.answers.hiddenPacks.length > 0;
      this.newBuild.startFresh();
      this.newBuild.apply(this.answers);
      this.restoreArtifact();
    } else if (step) {
      this.newBuild.apply(this.answers);
    }
    this.step = step && this.steps.includes(step) ? step : step ? 'summary' : null;
    if (this.step && !this.answers.visitedSteps.includes(this.step)) {
      this.update({ visitedSteps: [...this.answers.visitedSteps, this.step] });
    }
    if (this.step === 'artifact') {
      this.rankArtifacts();
    }
    if (this.step === 'sources') {
      this.packs.syncFromHidden(new Set(this.answers.hiddenPacks));
    }
    this.cdr.markForCheck();
  }

  private update(changes: Partial<NewBuildAnswers>): void {
    this.answers = { ...this.answers, ...changes };
    this.newBuild.saveAnswers(this.answers);
    this.cdr.markForCheck();
  }

  // Role and level

  get isMartial(): boolean {
    return this.answers.role === 'melee' || this.answers.role === 'ranged';
  }

  get isHealer(): boolean {
    return this.answers.role === 'caster' && this.answers.spellpowers.includes('Healing');
  }

  chooseRole(role: BuildRole, healer = false): void {
    if (this.answers.role === role && this.isHealer === healer) {
      return;
    }
    this.update(withRole(this.answers, role, healer));
  }

  setTrapping(trapping: boolean): void {
    this.update({ trapping });
  }

  get levelRange(): [number, number] {
    return levelRangeOf(this.answers, this.maxLevel);
  }

  get endgameLabel(): string {
    const [min, max] = levelRangeOf({ ...this.answers, level: 'endgame' }, this.maxLevel);
    return `${min}-${max}`;
  }

  /** Levelling starts at 1-20, or the range typed before switching to endgame and back. */
  setEndgame(endgame: boolean): void {
    if (endgame === (this.answers.level === 'endgame')) {
      return;
    }
    if (!endgame) {
      this.update({ level: [...this.levellingRange] as [number, number] });
      return;
    }
    if (this.answers.level !== 'endgame') {
      this.levellingRange = this.answers.level;
    }
    this.update({ level: 'endgame' });
  }

  setLevel(which: 0 | 1, value: string): void {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed) || this.answers.level === 'endgame') {
      return;
    }
    const range = [...this.answers.level] as [number, number];
    range[which] = Math.min(this.maxLevel, Math.max(1, parsed));
    if (range[0] > range[1]) {
      range[which === 0 ? 1 : 0] = range[which];
    }
    this.update({ level: range });
  }

  // Gear sources

  /** The pack checklist's state, made when first needed: it reads every item's packs. */
  get packs(): PackChecklistModel {
    this.packModel ??= new PackChecklistModel(this.gameData);
    return this.packModel;
  }

  setShowRaid(show: boolean): void {
    this.update({ showRaid: show });
  }

  setShowRare(show: boolean): void {
    this.update({ showRare: show });
  }

  /**
   * "Only packs I own" starts from the packs this browser last chose, else from
   * what everyone has for free (as the filter sheet does). "Every pack" also
   * forgets the remembered packs: this player doesn't want them.
   */
  setOwnsPacks(owns: boolean): void {
    if (owns === this.ownsPacks) {
      return;
    }
    this.ownsPacks = owns;
    if (!owns) {
      this.packsRemembered = false;
      this.newBuild.rememberPacks([]);
      this.update({ hiddenPacks: [] });
      return;
    }
    const remembered = this.newBuild.rememberedPacks();
    if (remembered) {
      this.packs.syncFromHidden(new Set(remembered));
      this.packsRemembered = true;
    } else {
      this.packs.tickFreeStart();
    }
    this.onPacksChanged();
  }

  onPacksChanged(): void {
    const hidden = Array.from(this.packs.hiddenPacks());
    this.newBuild.rememberPacks(hidden);
    this.update({ hiddenPacks: hidden });
  }

  get shownPackCount(): number {
    return this.packs.options.length - this.answers.hiddenPacks.length;
  }

  /** A new setup: every default, with the packs this browser chose last time. */
  private freshAnswers(): NewBuildAnswers {
    const remembered = this.newBuild.rememberedPacks();
    this.packsRemembered = !!remembered;
    return { ...emptyAnswers(), hiddenPacks: remembered ?? [] };
  }

  // Weapons and offhand

  get weaponFamilies(): ItemTypeFamily[] {
    return this.answers.role === 'ranged' ? RANGED_WEAPON_FAMILIES : this.answers.role === 'melee' ? MELEE_WEAPON_FAMILIES : [];
  }

  private get allowedWeapons(): string[] {
    return this.answers.weaponTypes ?? (this.answers.role === 'ranged' ? RANGED_WEAPON_TYPES : MELEE_WEAPON_TYPES);
  }

  isWeaponAllowed(type: string): boolean {
    return this.allowedWeapons.includes(type);
  }

  familyState(family: ItemTypeFamily): 'all' | 'some' | 'none' {
    const allowed = family.types.filter(type => this.isWeaponAllowed(type)).length;
    return allowed === family.types.length ? 'all' : allowed ? 'some' : 'none';
  }

  toggleWeapon(type: string): void {
    const allowed = this.allowedWeapons;
    this.update({ weaponTypes: allowed.includes(type) ? allowed.filter(t => t !== type) : [...allowed, type] });
  }

  toggleFamily(family: ItemTypeFamily): void {
    const allowed = this.allowedWeapons;
    this.update({
      weaponTypes: this.familyState(family) === 'all'
        ? allowed.filter(type => !family.types.includes(type))
        : [...allowed, ...family.types.filter(type => !allowed.includes(type))]
    });
  }

  /** Just this family: the quick way to say "I use two-handers". */
  onlyFamily(family: ItemTypeFamily): void {
    this.update({ weaponTypes: [...family.types] });
  }

  /** Only two-handed weapons allowed: the off hand stays empty, so there's nothing to ask. */
  get twoHandedOnly(): boolean {
    return isTwoHandedOnly(this.answers);
  }

  /** "Second weapon": no shields, orbs or rune arms, so the offhand lists the weapons chosen above. */
  get secondWeapon(): boolean {
    return this.answers.offhandTypes?.length === 0;
  }

  isOffhandFamilyAllowed(family: ItemTypeFamily): boolean {
    return this.answers.offhandTypes !== null && family.types.every(type => this.answers.offhandTypes!.includes(type));
  }

  toggleOffhandFamily(family: ItemTypeFamily): void {
    const current = this.answers.offhandTypes ?? [];
    this.update({
      offhandTypes: this.isOffhandFamilyAllowed(family)
        ? current.filter(type => !family.types.includes(type))
        : [...current, ...family.types.filter(type => !current.includes(type))]
    });
  }

  setOffhandAny(): void {
    this.update({ offhandTypes: null });
  }

  setSecondWeapon(): void {
    this.update({ offhandTypes: [] });
  }

  // Armor

  get armorKind(): 'any' | 'docent' | 'armor' {
    const types = this.answers.armorTypes;
    return types === null ? 'any' : types.length === 1 && types[0] === DOCENT_TYPE ? 'docent' : 'armor';
  }

  setArmorKind(kind: 'any' | 'docent' | 'armor'): void {
    this.update({ armorTypes: kind === 'any' ? null : kind === 'docent' ? [DOCENT_TYPE] : [...BODY_ARMOR_TYPES] });
  }

  isArmorAllowed(type: string): boolean {
    return this.answers.armorTypes?.includes(type) ?? true;
  }

  toggleArmor(type: string): void {
    const current = this.answers.armorTypes ?? [...BODY_ARMOR_TYPES];
    this.update({ armorTypes: current.includes(type) ? current.filter(t => t !== type) : [...current, type] });
  }

  // Stats

  toggleIn(key: 'abilities' | 'spellpowers' | 'schools' | 'tactics' | 'damageBoosts', value: string): void {
    const list = this.answers[key];
    this.update({ [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] });
  }

  // Trance

  setTrance(trance: TranceChoice): void {
    this.update({ trance });
  }

  /** The Insight Deadly counted for a trance: an estimate from the gear at these levels. */
  get tranceDeadly(): number {
    return tranceDeadlyFor(this.newBuild.bestCompetenceDeadly());
  }

  /** A step the player has been to, other than the one showing: the dots mark it. */
  isVisited(step: StartStep): boolean {
    return step !== this.step && this.answers.visitedSteps.includes(step);
  }

  // Extras

  get greenSteelChoices(): string[] {
    return greenSteelChoices(this.answers.role);
  }

  setGreenSteel(element: string | null): void {
    this.update({ greenSteel: element });
  }

  /** What the effect does, in the wiki's first sentence: '' until the descriptions load. */
  greenSteelDescription(element: string): string {
    return firstSentence(this.affixDescriptions.describe({ name: greenSteelAffix(element) }));
  }

  // Minor artifact

  get shownArtifacts(): ArtifactRow[] {
    const rows = this.artifacts ?? [];
    return this.showAllArtifacts ? rows : rows.slice(0, ARTIFACTS_SHOWN);
  }

  isChosenArtifact(row: ArtifactRow): boolean {
    return this.answers.artifact?.name === row.ranked.item.name;
  }

  chooseArtifact(row: ArtifactRow | null): void {
    this.queryParams.holdingUrl(() => {
      const previous = this.answers.artifact;
      if (previous) {
        this.equipped.clearSlot(previous.slot);
      }
      if (row) {
        this.equipped.set(row.ranked.item);
      }
    });
    this.update({ artifact: row ? { name: row.ranked.item.name, slot: row.ranked.item.slot } : null });
  }

  private restoreArtifact(): void {
    const chosen = this.answers.artifact;
    const item = chosen ? this.gearDB.findGearBySlot(chosen.slot, chosen.name) : undefined;
    if (item) {
      this.queryParams.holdingUrl(() => this.equipped.set(item));
    }
  }

  private async rankArtifacts(): Promise<void> {
    const run = ++this.rankingRun;
    this.artifacts = null;
    this.showAllArtifacts = false;
    // Ranked against the build without the chosen artifact, which every candidate would replace.
    const chosen = this.answers.artifact;
    if (chosen) {
      this.queryParams.holdingUrl(() => this.equipped.clearSlot(chosen.slot));
    }
    const ranked = await rankArtifacts(this.equipped, this.gearDB, () => run !== this.rankingRun);
    if (chosen && run === this.rankingRun) {
      this.restoreArtifact();
    }
    if (run !== this.rankingRun) {
      return;
    }
    this.artifacts = ranked.map(entry => ({
      ranked: entry,
      filigree: getMaxFiligreeSlots(entry.item),
      inputs: { item: entry.item, readonly: false, equipOnChange: false }
    }));
    this.cdr.markForCheck();
  }

  // Summary

  get summaryRows(): Array<{ step: StartStep; label: string; value: string }> {
    const a = this.answers;
    const rows: Array<{ step: StartStep; label: string; value: string }> = [];
    const role = a.role === null ? 'Not set'
      : a.role === 'caster' ? (this.isHealer ? 'Healer' : 'Caster') : a.role === 'melee' ? 'Melee' : 'Ranged';
    rows.push({ step: 'role', label: 'Role', value: `${role}${a.trapping ? ', with trapping' : ''}` });
    rows.push({ step: 'role', label: 'Levels', value: `${this.levelRange[0]}-${this.levelRange[1]}` });
    rows.push({ step: 'sources', label: 'Raid items', value: a.showRaid ? 'Shown' : 'Hidden' });
    rows.push({ step: 'sources', label: 'Rare items', value: a.showRare ? 'Shown' : 'Hidden' });
    rows.push({
      step: 'sources', label: 'Packs',
      value: a.hiddenPacks.length ? `${this.shownPackCount} of ${this.packs.options.length} packs` : 'Every pack'
    });
    if (this.isMartial) {
      rows.push({ step: 'weapons', label: 'Weapons', value: a.weaponTypes === null ? `Any ${a.role}` : listOrNone(a.weaponTypes) });
    }
    const offhand = this.twoHandedOnly ? 'None (two-handed)'
      : a.offhandTypes === null ? 'Any' : a.offhandTypes.length ? a.offhandTypes.join(', ') : 'Second weapon';
    rows.push({ step: 'weapons', label: 'Offhand', value: offhand });
    const armor = a.armorTypes === null ? 'Any'
      : BODY_ARMOR_TYPES.every(type => a.armorTypes!.includes(type)) && !a.armorTypes.includes(DOCENT_TYPE) ? 'Any but Docents'
        : listOrNone([DOCENT_TYPE, ...BODY_ARMOR_TYPES].filter(type => a.armorTypes!.includes(type)));
    rows.push({ step: 'armor', label: 'Armor', value: armor });
    rows.push({ step: 'stats', label: 'Main abilities', value: listOrNone(a.abilities) });
    if (a.role === 'caster') {
      rows.push({ step: 'stats', label: 'Spell power', value: listOrNone(a.spellpowers) });
    }
    if (this.isMartial) {
      const trance = a.trance === 'none' ? 'None'
        : `${a.trance === 'class' ? 'Class' : 'Universal'} trance, about Insight Deadly +${this.tranceDeadly}`;
      rows.push({ step: 'trance', label: 'Trance', value: trance });
    }
    rows.push({ step: 'extras', label: 'Green Steel', value: a.greenSteel ? `Legendary ${a.greenSteel}` : 'None' });
    if (this.steps.includes('artifact')) {
      rows.push({ step: 'artifact', label: 'Minor artifact', value: a.artifact?.name ?? 'Decide in the planner' });
    }
    return rows;
  }
}

function listOrNone(values: ReadonlyArray<string>): string {
  return values.length ? values.join(', ') : 'None';
}

/** A description's first sentence, without a trailing "(Note: ...)". */
function firstSentence(text: string): string {
  const withoutNote = text.replace(/\s*\(.*$/s, '').trim();
  const end = withoutNote.indexOf('. ');
  return end < 0 ? withoutNote : withoutNote.slice(0, end + 1);
}
