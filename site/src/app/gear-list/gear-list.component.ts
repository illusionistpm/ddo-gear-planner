import { Component, OnInit, ChangeDetectionStrategy, AfterViewInit, AfterViewChecked, OnDestroy, ElementRef, HostListener, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService, VisibleSetBonus } from '../planner/equipped.service';
import { Affix } from '../affixes/affix';
import { AffixUiService } from '../affixes/affix-ui.service';
import { AnalyticsService } from '../shared/analytics.service';
import { perfAfterFrames, perfStart } from '../shared/perf-trace';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { PlannerOnboardingService } from '../planner/planner-onboarding.service';
import { slotLabel } from '../gear/slot-display';
import { AffixSourceHighlightService, NON_GEAR_JUMP_TARGET, setJumpTarget } from '../planner/affix-source-highlight.service';

/** How long a card stays highlighted after the jump bar scrolls to it - matches the CSS animation. */
const JUMP_HIGHLIGHT_MS = 1200;

/**
 * The jump bar's layouts, roomiest first; fitJumpBar takes the first that fits.
 * Each is a set of classes on the bar - see gear-list.component.css. If even the
 * last overflows, the bar scrolls sideways.
 */
const JUMP_BAR_FITS: ReadonlyArray<ReadonlyArray<string>> = [
  ['show-labels'],
  [],
  ['dense'],
  ['dense', 'merge-sets']
];
const JUMP_BAR_FIT_CLASSES = ['show-labels', 'dense', 'merge-sets'];

@Component({
    selector: 'app-gear-list',
    templateUrl: './gear-list.component.html',
    styleUrls: ['./gear-list.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class GearListComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  constructor(
    public gearList: GearDbService,
    public equipped: EquippedService,
    public affixUi: AffixUiService,
    private analytics: AnalyticsService,
    private suggestionDrawer: SuggestionDrawerService,
    private onboarding: PlannerOnboardingService,
    private host: ElementRef<HTMLElement>,
    private sourceHighlight: AffixSourceHighlightService
  ) { }

  readonly slotLabel = slotLabel;
  readonly nonGearTarget = NON_GEAR_JUMP_TARGET;
  readonly setTarget = setJumpTarget;

  @ViewChild('jumpBar') private jumpBar?: ElementRef<HTMLElement>;
  setMenuOpen = false;
  /** Where the sets menu's right edge goes: under the right edge of the chip that opened it. */
  setMenuRight = 0;
  private jumpBarObserver?: ResizeObserver;
  /** How many set chips the bar was last fitted with; a change means fitting again. */
  private fittedSetCount = -1;

  visibleSetBonuses: Array<VisibleSetBonus> = [];
  /** Sets with at least one bonus tier active - the ones the jump bar has a chip for. */
  activeSets: Array<VisibleSetBonus> = [];
  nonGearCount = 0;
  onboardingActive = true;
  armorStartHint = false;
  private loggedInitialViewChecked = false;
  private onboardingSubscription?: Subscription;
  private slotSubscriptions: Subscription[] = [];
  private sourceHighlightSubscription?: Subscription;
  private nonGearSubscription?: Subscription;
  /** Jump targets supplying the bonus type being hovered on the affix panel; their chips light up. */
  sourceTargets: ReadonlySet<string> = new Set();
  /** What each slot holds, by name, for the jump bar's tooltips. */
  private slotItemNames = new Map<string, string>();
  private highlightedCard?: HTMLElement;
  private highlightTimer?: ReturnType<typeof setTimeout>;

  ngOnInit() {
    const done = perfStart('GearListComponent.ngOnInit');
    this.equipped.getVisibleSetBonusesObservable().subscribe(setBonuses => {
      this.visibleSetBonuses = setBonuses;
      this.activeSets = setBonuses.filter(setBonus => setBonus.tiers.some(tier => tier.eligible));
    });
    this.nonGearSubscription = this.equipped.getExternalAffixesObservable().subscribe(entries => {
      this.nonGearCount = entries.length;
    });
    this.refreshOnboardingState();
    this.sourceHighlightSubscription = this.sourceHighlight.targets$.subscribe(targets => {
      this.sourceTargets = targets;
    });
    this.onboardingSubscription = this.onboarding.getOnboardingState().subscribe(() => {
      this.refreshOnboardingState();
    });
    for (const slot of this.gearList.getSlots()) {
      const slotObservable = this.equipped.getSlot(slot);
      if (slotObservable) {
        this.slotSubscriptions.push(slotObservable.subscribe(item => {
          if (item) {
            this.slotItemNames.set(slot, item.name);
          } else {
            this.slotItemNames.delete(slot);
          }
          this.refreshOnboardingState();
        }));
      }
    }
    done({});
  }

  ngOnDestroy() {
    this.onboardingSubscription?.unsubscribe();
    this.sourceHighlightSubscription?.unsubscribe();
    this.nonGearSubscription?.unsubscribe();
    for (const slotSubscription of this.slotSubscriptions) {
      slotSubscription.unsubscribe();
    }
    this.clearJumpHighlight();
    this.jumpBarObserver?.disconnect();
  }

  ngAfterViewInit() {
    const bar = this.jumpBar?.nativeElement;
    if (bar) {
      this.jumpBarObserver = new ResizeObserver(() => this.fitJumpBar());
      this.jumpBarObserver.observe(bar);
    }
    const done = perfStart('GearListComponent.ngAfterViewInit');
    done({
      slotCount: this.gearList.getSlots().length,
      activeSetBonusCount: this.visibleSetBonuses.length
    });
    perfAfterFrames('paint after gear list view init');
  }

  ngAfterViewChecked() {
    if (this.activeSets.length !== this.fittedSetCount) {
      this.fitJumpBar();
    }

    if (this.loggedInitialViewChecked) {
      return;
    }

    this.loggedInitialViewChecked = true;
    const done = perfStart('GearListComponent.ngAfterViewChecked.first');
    done({
      activeSetBonusCount: this.visibleSetBonuses.length
    });
  }

  showItemsInSet(setName: string) {
    this.analytics.track('open_set_items', {
      source: 'active_set'
    });
    this.suggestionDrawer.openSet(setName);
  }

  getSetBonusTooltip(eligible: boolean, threshold: number, pieces: number, affix: Affix): string {
    return eligible ? this.affixUi.getAffixTooltip(affix) : this.affixUi.getSetBonusLockedTooltip(threshold, pieces);
  }

  /** The jump bar chip's tooltip and accessible name: the slot and what's in it. */
  getJumpLabel(slot: string): string {
    const label = slotLabel(slot);
    if (this.equipped.isSlotDisabled(slot)) {
      return `${label}: unavailable while a two-handed weapon is equipped`;
    }

    const itemName = this.slotItemNames.get(slot);
    return itemName ? `${label}: ${itemName}` : `${label}: empty`;
  }

  /** The number that tells Ring 1 from Ring 2 when the jump bar shows icons only. */
  getSlotNumber(slot: string): string {
    return /(\d+)$/.exec(slot)?.[1] ?? '';
  }

  /**
   * Picks the roomiest layout in which the whole jump bar fits on one line. Called
   * when the bar's width changes and when a set chip comes or goes. Classes are set
   * straight on the element, so each layout can be measured in turn without waiting
   * for change detection. A hidden bar (the other tab, or a phone) is left alone.
   */
  fitJumpBar() {
    const bar = this.jumpBar?.nativeElement;
    if (!bar || !bar.clientWidth) {
      return;
    }

    this.fittedSetCount = this.activeSets.length;
    for (const fit of JUMP_BAR_FITS) {
      bar.classList.remove(...JUMP_BAR_FIT_CLASSES);
      bar.classList.add(...fit);
      if (bar.scrollWidth <= bar.clientWidth) {
        break;
      }
    }

    // The sets menu belongs to the merged chip; with the sets back as their own
    // chips it has nothing to hang off. Deferred, as this can run mid change detection.
    if (this.setMenuOpen && !bar.classList.contains('merge-sets')) {
      queueMicrotask(() => this.setMenuOpen = false);
    }
  }

  /** The merged sets chip is always the bar's last, so the menu opens leftwards from it. */
  toggleSetMenu(chip: HTMLElement) {
    this.setMenuOpen = !this.setMenuOpen;
    const wrap = chip.closest<HTMLElement>('.slot-jump-bar-wrap');
    if (this.setMenuOpen && wrap) {
      this.setMenuRight = Math.max(0, wrap.getBoundingClientRect().right - chip.getBoundingClientRect().right);
    }
  }

  @HostListener('document:keydown.escape')
  closeSetMenu() {
    this.setMenuOpen = false;
  }

  /** Closes the sets menu on a click anywhere but the menu or the chip that opens it. */
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as Element | null;
    if (this.setMenuOpen && !target?.closest('.slot-jump-set-menu, .is-set-merged')) {
      this.setMenuOpen = false;
    }
  }

  getSetsJumpLabel(): string {
    const count = this.activeSets.length;
    return `Sets: ${count} with active bonuses`;
  }

  isAnySetSource(): boolean {
    return this.activeSets.some(setBonus => this.sourceTargets.has(setJumpTarget(setBonus.setName)));
  }

  getNonGearJumpLabel(): string {
    return this.nonGearCount
      ? `Non-gear: ${this.nonGearCount} ${this.nonGearCount === 1 ? 'entry' : 'entries'}`
      : 'Non-gear: none';
  }

  getSetJumpLabel(setBonus: VisibleSetBonus): string {
    return `Set: ${setBonus.setName} (${setBonus.pieces} equipped)`;
  }

  /**
   * Scrolls a card - a slot's, the non-gear card or a set's - to the top of the
   * panel, clear of the (sticky) jump bar, and flashes it so the eye lands on it.
   * `target` is the card's data-jump-target: a slot name, NON_GEAR_JUMP_TARGET or
   * setJumpTarget(name).
   */
  jumpTo(target: string, bar: HTMLElement) {
    const card = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-jump-target]'))
      .find(candidate => candidate.dataset['jumpTarget'] === target);
    if (!card) {
      return;
    }

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    card.style.scrollMarginTop = `${bar.offsetHeight + 8}px`;
    card.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });

    this.clearJumpHighlight();
    this.highlightedCard = card;
    card.classList.add('slot-jump-highlight');
    this.highlightTimer = setTimeout(() => this.clearJumpHighlight(), JUMP_HIGHLIGHT_MS);

    this.analytics.track('jump_to_card', { target: target.startsWith('set:') ? 'set' : target });
  }

  shouldShowArmorStartHint() {
    return this.armorStartHint;
  }

  dismissIntro() {
    this.onboarding.dismissIntro();
    this.refreshOnboardingState();
  }

  private clearJumpHighlight() {
    clearTimeout(this.highlightTimer);
    this.highlightTimer = undefined;
    this.highlightedCard?.classList.remove('slot-jump-highlight');
    this.highlightedCard = undefined;
  }

  private refreshOnboardingState() {
    this.onboardingActive = this.onboarding.shouldShowOnboarding();
    this.armorStartHint = this.onboardingActive && this.equipped.isBuildEmpty();
  }
}
