import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, combineLatest, distinctUntilChanged, take } from 'rxjs';

import { AffixEditorService } from '../planner/affix-editor.service';
import { AffixPackagesService } from '../affixes/affix-packages.service';
import { troveNameKey, UserGearService } from '../planner/user-gear.service';
import { GearDbService } from '../gear/gear-db.service';
import { AnalyticsService } from '../shared/analytics.service';
import { FiltersService } from '../planner/filters.service';
import { ItemFilters } from '../gear/item-filters';
import { EquippedService, PlannerTab } from '../planner/equipped.service';
import { PlannerOnboardingService } from '../planner/planner-onboarding.service';
import { ThemeMode, ThemeService } from '../shared/theme.service';
import { AuthService } from '../shared/auth.service';
import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { BuildsService } from '../build/builds.service';
import { CurrentBuildService } from '../build/current-build.service';
import { ListReturnService } from '../build/list-return.service';
import { QueryParamsService } from '../build/query-params.service';
import { ShoppingListViewService } from '../planner/shopping-list/shopping-list-view.service';
import { CraftingSlotsViewService } from '../planner/crafting-slots/crafting-slots-view.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { SupportLinkComponent } from '../support-link/support-link.component';
import { PageChromeBack } from '../page-chrome/page-chrome.component';

@Component({
    selector: 'app-main',
    templateUrl: './main.component.html',
    styleUrls: ['./main.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class MainComponent implements OnInit, AfterViewInit, OnDestroy {
  troveUploadStatus: string = '';
  sortOwnedToTop: boolean = true;
  activeTab: PlannerTab = 'equipment';
  filtersOpen: boolean = false;
  itemFilters = new ItemFilters();
  onboardingActive = true;
  trackedAffixesHint = false;
  /** The intro has just been finished: its closing "you're all set" message is up. */
  wrapUpShown = false;
  /** For the wrap-up: the sign-in suggestion is only for someone signed out. */
  signedIn = false;
  private signedInSubscription?: Subscription;
  // Derived from initialGateReady && !isLoadingBuild (see updateContentReady) -
  // gates the equipment/affix panels so a visitor never sees a flash of
  // empty slots, or another build's data, before the real build has
  // actually populated in.
  contentReady = false;

  // Set when a /build/:shortId(/:slug) fetch (loadBuildFromRoute) fails -
  // rendered as a dedicated panel instead of the main UI, in place of the
  // boot splash contentReady would otherwise still be gating. Previously
  // ANY failure - a genuine 404, a decode failure against a URL from an
  // older codec dictionary version, or a transient network blip - all
  // redirected to '/' and threw the URL away with no way back; 404,
  // "outdated/invalid link," and "couldn't load, try again" now read as
  // three different situations, and the URL survives all three so a
  // network-error retry doesn't need the link re-pasted.
  loadError: 'not-found' | 'invalid-link' | 'network' | null = null;

  @ViewChild('plannerPage') private plannerPage?: ElementRef<HTMLElement>;
  @ViewChild('plannerChrome') private plannerChrome?: ElementRef<HTMLElement>;
  @ViewChild('tabPanels') private tabPanels?: ElementRef<HTMLElement>;
  @ViewChild(SupportLinkComponent) private support?: SupportLinkComponent;

  private chromeObserver?: ResizeObserver;

  // The one-time gate from the original contentReady design: covers the
  // window between page load and the first build data actually reaching
  // EquippedService (most noticeable right after an Auth0 login redirect,
  // where that gap is a genuine network round-trip rather than a same-tick
  // timing quirk). Never reverts to false once true - re-navigations after
  // this are covered by isLoadingBuild instead.
  private initialGateReady = false;

  // True while a /build/:shortId fetch triggered by loadBuildFromRoute is
  // in flight. Angular's RouteReuseStrategy reuses this component across
  // navigations between two different shortId values, and without this flag
  // contentReady (once true) stayed true across that reuse - the previous
  // build's already-applied data (or, on first load, its default empty
  // state) stayed on screen for the whole fetch instead of the loading
  // screen, then jump-cut to the new build once it landed.
  private isLoadingBuild = false;

  // Tracks the shortId (if any) from the most recent route.paramMap
  // emission - read by the buildIdentitySubscription below to tell
  // "genuinely navigated to a fresh scratch build" apart from "this build's
  // shortId was just dropped from the URL because it went dirty" (see
  // QueryParamsService.navigateWithParams). Both look identical from
  // route.paramMap alone (shortId just becomes null either way).
  private latestRouteShortId: string | null = null;

  // shortIds confirmOwnershipIfSignedIn has already resolved (successfully -
  // see its comment) this component instance's lifetime, so repeatedly
  // bouncing between the same couple of builds via browser back/forward
  // doesn't re-hit listMine() on every single restore. Not a substitute for
  // CurrentBuildService's own carry-forward of already-resolved ownership
  // across a same-build restore (see restoreIdentity's comment) - this
  // covers the case that doesn't help with: switching to a genuinely
  // different build's identity, which always resets to 'unknown' there.
  private ownershipCheckedForShortId = new Set<string>();

  private filterSubscription?: Subscription;
  private onboardingSubscription?: Subscription;
  private tabSubscription?: Subscription;
  private routeParamsSubscription?: Subscription;
  private buildIdentitySubscription?: Subscription;
  private initialParamsAppliedSubscription?: Subscription;
  private ownershipMemoAuthSubscription?: Subscription;
  private slotSubscriptions: Subscription[] = [];
  private shoppingListSubscription?: Subscription;
  private craftingSlotsSubscription?: Subscription;
  /** The shopping list takes the planner's place while open; the planner stays mounted underneath. */
  shoppingListOpen = false;
  /** Whether the Equipment panel shows the crafting slots view rather than the gear cards. */
  craftingSlotsOpen = false;

  onSortOwnedToTopChanged(value: boolean) {
    this.sortOwnedToTop = value;
  }

  constructor(
    private userGear: UserGearService,
    private gearDb: GearDbService,
    private analytics: AnalyticsService,
    private filters: FiltersService,
    private equipped: EquippedService,
    private onboarding: PlannerOnboardingService,
    public theme: ThemeService,
    private affixEditor: AffixEditorService,
    private affixPackages: AffixPackagesService,
    private route: ActivatedRoute,
    private router: Router,
    private buildsService: BuildsService,
    private buildUrlCodec: BuildUrlCodecService,
    private queryParams: QueryParamsService,
    private currentBuild: CurrentBuildService,
    private auth: AuthService,
    private shoppingListView: ShoppingListViewService,
    private craftingSlotsView: CraftingSlotsViewService,
    private suggestionDrawer: SuggestionDrawerService
  ) {
    // Watching from here on, so a shopping list's page can come back to the planner as it was.
    inject(ListReturnService);
  }

  ngOnInit() {
    this.userGear.loadFromStorage();
    // Clears ownershipCheckedForShortId (confirmOwnershipIfSignedIn's memo,
    // below) on every genuine auth transition - it answers "is shortId X
    // mine?" for whichever account is signed in right now, so it's stale
    // across a real account switch. In practice AuthService's
    // signIn()/signOut() always round-trip through a full page redirect
    // (see its comments), which already wipes this memo along with the
    // rest of the app's state, but clearing it explicitly here doesn't
    // depend on that staying true. distinctUntilChanged because
    // isAuthenticated$ can re-emit its current value without an actual
    // transition, which would otherwise clear a memo that's still valid.
    //
    // Set up BEFORE routeParamsSubscription below, deliberately: with a
    // synchronous auth source (a real login session restored from
    // localstorage - or, in a test, an `of(...)`), subscribing here fires
    // this clear() immediately, on this still-empty Set - harmless. Wiring
    // it up AFTER routeParamsSubscription instead let a real bug through:
    // routeParamsSubscription's own synchronous load-and-confirm cycle
    // (below) would populate the memo, and then this subscription's first,
    // redundant emission would immediately wipe out the entry it just
    // added, defeating the memo on the very first load.
    this.ownershipMemoAuthSubscription = this.auth.isAuthenticated$.pipe(distinctUntilChanged()).subscribe(() => {
      this.ownershipCheckedForShortId.clear();
    });
    // Subscribed rather than read once from the snapshot: Angular's default
    // RouteReuseStrategy reuses this same component instance across
    // navigations between two different /build/:shortId values (they match
    // the same route config), so ngOnInit only runs once - without this
    // subscription, clicking a different build in MyBuildsComponent would
    // silently fail to load it.
    this.routeParamsSubscription = this.route.paramMap.subscribe(paramMap => {
      this.loadBuildFromRoute(paramMap.get('shortId'));
    });
    // See buildIdentityFromUrl$'s comment in query-params.service.ts: this
    // is what actually restores a dirty, previously-loaded build's identity
    // (name, shortId) after the URL dropped its shortId path segment - on
    // the initial drop itself (a self-triggered write) this never fires,
    // which is correct, since CurrentBuildService's in-memory state is
    // already right at that point; it's browser back/forward through those
    // edits (a real navigation) that needs this to reapply what the URL
    // says. Uses restoreIdentity(), not markLoaded() - see its comment for
    // why treating every restored history point as a fresh clean load would
    // be wrong.
    //
    // Ownership never travels through the URL (see BuildUrlIdentity's
    // comment), so restoreIdentity() alone can leave it at 'unknown' for a
    // build the viewer actually owns - re-run the same confirmOwnershipIfSignedIn
    // check loadBuildFromRoute uses on a fresh fetch, so history navigation
    // resolves it too, not just the initial load.
    this.buildIdentitySubscription = this.queryParams.buildIdentityFromUrl$.subscribe(identity => {
      if (identity) {
        this.currentBuild.restoreIdentity(identity);
        if (identity.shortId) {
          this.confirmOwnershipIfSignedIn(identity.shortId);
        }
      } else if (!this.latestRouteShortId) {
        this.currentBuild.reset();
      }
    });
    // Not a one-shot call: this component's ngOnInit runs before
    // AppComponent's NavigationEnd-driven updateFromParams() reaches
    // QueryParamsService, so a synchronous check here would always see the
    // pre-load empty state. Re-run every time params are (re)applied
    // instead - this also self-corrects the case where a second navigation
    // follows the first with the real data (e.g. an Auth0 redirect: the
    // callback URL lands here first with no build params, then the SDK
    // navigates again to the actual target - same route config, so this
    // component is reused rather than recreated).
    //
    // Also gated on auth.isLoading$: while the SDK is still processing a
    // login redirect, the first (empty) navigation's params have already
    // applied, but the real target navigation hasn't landed yet - showing
    // the planner here would flash an empty build
    // for the ~network-round-trip duration of that callback exchange, not a
    // same-tick coincidence like the race above.
    //
    // isLoading$ alone isn't quite enough, though: reading auth0-angular's
    // own source, handleRedirectCallback() fires router.navigateByUrl(target)
    // and then - without awaiting that navigation - synchronously flips
    // isLoading to false in the same operator chain. Router navigation is
    // itself async (guards, resolvers, rendering), so there's a real window
    // where isLoading$ has already gone false but the router is still
    // mid-flight to the actual target and this component is still sitting
    // on the transient callback URL. isOnAuthRedirectCallbackUrl() below
    // closes that window by checking for the code/state query params Auth0
    // appends to that transient URL, rather than trusting isLoading$'s
    // timing alone.
    this.initialParamsAppliedSubscription = combineLatest([
      this.queryParams.initialParamsApplied$,
      this.auth.isLoading$
    ]).subscribe(([, isLoading]) => {
      if (!isLoading && !this.isOnAuthRedirectCallbackUrl()) {
        const alreadyReady = this.contentReady;
        this.initialGateReady = true;
        this.updateContentReady();
        if (alreadyReady) {
          // Params applied again after the page was already up: "New build"
          // (MyBuildsComponent navigates to '/' with reset state) lands here.
          this.applyFreshBuildDefaults(false);
        }
      }
    });
    this.tabSubscription = this.equipped.getActiveMainTab().subscribe(tab => {
      this.activeTab = tab;
      // The rails switch views by calling EquippedService.setActiveMainTab directly,
      // so mirror the housekeeping selectTab() used to do for the removed tab bar.
      this.closeFilters();
      this.refreshOnboardingState();
    });
    this.shoppingListSubscription = this.shoppingListView.isOpen$.subscribe(open => {
      this.shoppingListOpen = open;
      if (open) {
        // Nothing of the planner's stays floating over the list.
        this.closeFilters();
        this.support?.close();
        this.suggestionDrawer.close();
      }
    });
    this.craftingSlotsSubscription = this.craftingSlotsView.isOpen$.subscribe(open => {
      this.craftingSlotsOpen = open;
    });
    this.filterSubscription = this.filters.getItemFilters().subscribe(itemFilters => {
      this.itemFilters = itemFilters;
    });
    this.signedInSubscription = this.auth.isAuthenticated$.subscribe(signedIn => this.signedIn = signedIn);
    this.refreshOnboardingState();
    this.onboardingSubscription = this.onboarding.getOnboardingState().subscribe(() => {
      this.refreshOnboardingState();
    });
    for (const slot of this.gearDb.getSlots()) {
      const slotObservable = this.equipped.getSlot(slot);
      if (slotObservable) {
        this.slotSubscriptions.push(slotObservable.subscribe(() => this.refreshOnboardingState()));
      }
    }
  }

  ngAfterViewInit() {
    this.publishChromeMetrics();
    if (typeof ResizeObserver === 'undefined') {
      return;
    }
    // The chrome changes height on its own: filter chips wrap in and out of
    // row 2, the build name grows, and the narrow layout restacks it.
    this.chromeObserver = new ResizeObserver(() => this.publishChromeMetrics());
    if (this.plannerChrome) {
      this.chromeObserver.observe(this.plannerChrome.nativeElement);
    }
    // This one is how the rails learn that row 1 has slid away: the panels
    // grow into the space it leaves, and the observer fires through the slide.
    if (this.tabPanels) {
      this.chromeObserver.observe(this.tabPanels.nativeElement);
    }
  }

  ngOnDestroy() {
    this.chromeObserver?.disconnect();
    this.filterSubscription?.unsubscribe();
    this.onboardingSubscription?.unsubscribe();
    this.signedInSubscription?.unsubscribe();
    this.tabSubscription?.unsubscribe();
    this.routeParamsSubscription?.unsubscribe();
    this.buildIdentitySubscription?.unsubscribe();
    this.initialParamsAppliedSubscription?.unsubscribe();
    this.ownershipMemoAuthSubscription?.unsubscribe();
    this.shoppingListSubscription?.unsubscribe();
    this.craftingSlotsSubscription?.unsubscribe();
    for (const slotSubscription of this.slotSubscriptions) {
      slotSubscription.unsubscribe();
    }
  }

  // /build/:shortId(/:slug) carries no query string - GET /api/build/:shortId
  // is public and returns just {name, blob} (no id, no owner - see
  // builds.service.ts), so decode it and apply it directly rather than
  // going through the URL query-param pipeline AppComponent normally owns
  // (which explicitly skips this route shape - see build-route.ts).
  private loadBuildFromRoute(shortId: string | null) {
    this.latestRouteShortId = shortId;
    // Clear any error from a previous attempt at this shortId (retryLoad)
    // or a prior build entirely - a route reached without going through
    // loadError's own retry/navigation should never inherit a stale one.
    this.loadError = null;
    if (!shortId) {
      // Navigated to a route with no shortId - could be a genuinely fresh
      // scratch build (CurrentBuildService is a singleton and wouldn't
      // otherwise know to drop a previously loaded build's state), or it
      // could be an already-loaded build whose shortId was just dropped
      // from the URL because it went dirty (see
      // QueryParamsService.navigateWithParams). Those look identical here -
      // the buildIdentitySubscription above is what actually decides
      // between reset() and restoring identity, using latestRouteShortId
      // (just set above) to tell them apart.
      this.isLoadingBuild = false;
      this.updateContentReady();
      return;
    }

    if (shortId === this.currentBuild.value.shortId) {
      // Landed back on this build's own bare canonical URL - most likely
      // browser back all the way through an edit session (the shortId
      // itself never actually changed if we were dirty-editing on the root
      // route the whole time, so this is the only place that transition
      // becomes visible), but could also be a redundant re-emission for a
      // build that's already exactly right on screen. Whatever's currently
      // applied to EquippedService/FiltersService may reflect an abandoned
      // edit, so reassert this build's canonical params when a local cache
      // is available (the common case: this build was already fetched, or
      // just saved, this session) - synchronous, so it doesn't flash the
      // loading screen for a build that's already on screen. No cache
      // (e.g. a build created via Save this session, then edited and
      // navigated all the way back without ever having been GET-fetched
      // by shortId) is rare enough to just leave as a no-op here rather
      // than force a fetch on every same-shortId re-emission.
      const cached = this.currentBuild.getCanonicalParamsCache(shortId);
      if (cached) {
        this.queryParams.applyDecodedBuildParams(cached);
      }
      return;
    }

    this.isLoadingBuild = true;
    this.updateContentReady();

    this.buildsService.getByShortId(shortId).subscribe({
      next: ({ name, blob }) => {
        const decoded = this.buildUrlCodec.decode(blob);
        if (!decoded) {
          // The codec dictionary is versioned data that changes over time
          // (see build-url-codec.service.ts) - a blob this old client can't
          // decode isn't the same situation as a build that doesn't exist,
          // and shouldn't read as one.
          this.loadError = 'invalid-link';
          this.isLoadingBuild = false;
          this.updateContentReady();
          return;
        }
        this.queryParams.applyDecodedBuildParams(decoded);
        this.currentBuild.markLoaded({ shortId, name, canonicalParams: decoded });
        // A short link is someone showing you their gear: always open on
        // it, whatever tab this browser last had, and keep the intro out of
        // the way while there's gear to look at.
        this.equipped.setActiveMainTab('equipment');
        this.onboarding.bypassForBuildLink();
        this.confirmOwnershipIfSignedIn(shortId);
        this.isLoadingBuild = false;
        this.updateContentReady();
      },
      error: (err: HttpErrorResponse) => {
        // A 404 (genuinely no build at that shortId) is a different
        // situation from anything else (offline, a 5xx, a CORS hiccup) -
        // the former has no reason to ever resolve differently; the latter
        // is exactly what retryLoad() is for.
        this.loadError = err.status === 404 ? 'not-found' : 'network';
        this.isLoadingBuild = false;
        this.updateContentReady();
      }
    });
  }

  /** Bound to the load-error panel's "Try again" action - see loadError. */
  retryLoad(): void {
    this.loadBuildFromRoute(this.latestRouteShortId);
  }

  private updateContentReady(): void {
    const previous = this.contentReady;
    this.contentReady = this.initialGateReady && !this.isLoadingBuild;
    // Only once real build data (or a genuinely empty scratch build) has
    // landed - judged any earlier, a build still being fetched looks empty.
    if (!previous && this.contentReady && !this.loadError) {
      this.applyFreshBuildDefaults(true);
    }
  }

  /**
   * A genuinely empty URL starts on the Basic package, on the Affixes view
   * with the editor open - asking what the build is for comes first. Never a
   * followed link or a saved build: those are someone's build, to show as it is.
   *
   * On the first load, an untouched fresh build reloaded (Basic already in its
   * URL, no focus yet) gets the same welcome. Later re-applications - a real
   * navigation, browser back - only do when they just started one afresh,
   * so the editor never jumps open over someone already looking at the gear.
   */
  private applyFreshBuildDefaults(firstLoad: boolean) {
    if (this.latestRouteShortId || !this.equipped.isBuildEmpty()) {
      return;
    }
    let startedFresh = false;
    if (!this.equipped.getImportantAffixes().size) {
      this.affixPackages.addDefaultPackage();
      startedFresh = true;
      // The app picked Basic, not the user - it isn't an unsaved change. Only
      // for a fresh build: browser back to an edited build's URL can land here
      // too, with its identity still set, and its dirty state is real.
      if (!this.currentBuild.value.shortId) {
        this.currentBuild.acceptCurrentAsBaseline();
      }
    }
    if (startedFresh || (firstLoad && this.affixPackages.needsStart())) {
      this.equipped.setActiveMainTab('affixes');
      this.affixEditor.open();
    }
  }

  // True only on the transient URL Auth0's redirect lands on mid-login -
  // see the long comment above the combineLatest subscription in ngOnInit
  // for why isLoading$ alone can't be trusted to have cleared before this
  // URL is replaced by the SDK's own follow-up navigation.
  private isOnAuthRedirectCallbackUrl(): boolean {
    const queryParamMap = this.router.parseUrl(this.router.url).queryParamMap;
    return queryParamMap.has('code') && queryParamMap.has('state');
  }

  // Ownership can't be known from the public shortId lookup above (it
  // doesn't check auth or return an owner). If the viewer is signed in,
  // cross-reference their own build list instead of changing that public
  // endpoint's shape.
  private confirmOwnershipIfSignedIn(shortId: string) {
    if (this.ownershipCheckedForShortId.has(shortId)) {
      return;
    }
    this.auth.isAuthenticated$.pipe(take(1)).subscribe(isAuthenticated => {
      if (!isAuthenticated) {
        // Not memoized: signing in later (always a fresh page load - see
        // AuthService) re-runs this from scratch anyway, and it's cheap to
        // re-check (no network call) if it's ever hit again meanwhile.
        return;
      }
      this.buildsService.listMine().subscribe({
        next: builds => {
          this.ownershipCheckedForShortId.add(shortId);
          const owned = builds.find(build => build.shortId === shortId);
          // Explicitly deny, not just skip, when there's no match -
          // CurrentBuildService.confirmOwnership's savedBuildId: null branch
          // is what actually resolves 'unknown' to 'other' for a build that
          // genuinely isn't the viewer's; leaving this a no-op would strand
          // it at 'unknown' forever.
          this.currentBuild.confirmOwnership(shortId, owned?.id ?? null);
        },
        // Best-effort: a failed check still degrades ownership to 'other' (so
        // "Save a copy" stays reachable instead of the save control sitting
        // disabled forever - see CurrentBuildService.confirmOwnership's
        // comment). Memoized like a success, and before confirmOwnership():
        // that call republishes this shortId's identity, which re-enters
        // here through buildIdentityFromUrl$. Unmemoized, a failure that
        // keeps failing - a dead Auth0 refresh token, say - retried in an
        // unbounded loop of failed token exchanges, which exhausted the
        // Auth0 tenant's rate limit and blocked every login. An auth
        // transition or a reload still clears the memo for a real retry.
        error: () => {
          this.ownershipCheckedForShortId.add(shortId);
          this.currentBuild.confirmOwnership(shortId, null);
        }
      });
    });
  }

  /**
   * Two measurements the CSS cannot work out for itself, both of which used to
   * be hand-measured `calc(100vh - 5.5rem)` / `- 4.5rem` stand-ins for a bar
   * that has since gained a second line.
   *
   * --planner-chrome-height is how much of the viewport the chrome occupies,
   * for the things anchored underneath it: the filter sheet and the Ko-fi
   * popover. --planner-panel-height is the visible height of the scroll
   * container, for the sticky rails inside it - they are stuck to the top of
   * that container, so its height, not the viewport's, is what they fit in.
   */
  private publishChromeMetrics() {
    const chrome = this.plannerChrome?.nativeElement;
    const page = this.plannerPage?.nativeElement;
    if (!chrome || !page) {
      return;
    }

    const px = (value: string) => {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const chromeBox = chrome.offsetHeight + px(getComputedStyle(chrome).marginBottom);
    page.style.setProperty('--planner-chrome-height',
      `${px(getComputedStyle(page).paddingTop) + chromeBox}px`);

    const panels = this.tabPanels?.nativeElement;
    if (panels) {
      page.style.setProperty('--planner-panel-height', `${panels.clientHeight}px`);
    }
  }


  selectTab(tab: PlannerTab) {
    if (tab === this.activeTab) {
      this.closeFilters();
      return;
    }

    this.activeTab = tab;
    this.equipped.setActiveMainTab(tab);
    this.closeFilters();
    this.refreshOnboardingState();
  }

  closeShoppingList() {
    this.shoppingListView.close();
  }

  showItems() {
    if (this.craftingSlotsOpen) {
      this.craftingSlotsView.close();
    }
  }

  showCraftingSlots() {
    if (!this.craftingSlotsOpen) {
      this.craftingSlotsView.open('switch');
    }
  }

  isActiveTab(tab: PlannerTab) {
    return this.activeTab === tab;
  }

  toggleFilters() {
    this.filtersOpen = !this.filtersOpen;
  }

  /** The list's way back to the planner, in the header it shows while open. */
  readonly plannerBack: PageChromeBack = { label: 'Planner', title: 'Back to the planner' };

  /** The account menu's theme switch: a fixed choice, or follow the device. */
  readonly themeOptions: ReadonlyArray<{ mode: ThemeMode; label: string; icon: string }> = [
    { mode: 'light', label: 'Light theme', icon: 'fa-sun' },
    { mode: 'dark', label: 'Dark theme', icon: 'fa-moon' },
    { mode: 'system', label: 'Match my device', icon: 'fa-desktop' }
  ];

  closeFilters() {
    this.filtersOpen = false;
  }

  getLevelRangeSummary() {
    return `Level ${this.itemFilters.levelRange[0]}-${this.itemFilters.levelRange[1]}`;
  }

  isLevelRangeDefault() {
    return this.itemFilters.levelRange[0] === ItemFilters.MIN_LEVEL()
      && this.itemFilters.levelRange[1] === this.filters.getMaxLevel();
  }

  hasHiddenPacks() {
    return this.itemFilters.hiddenPacks.size > 0;
  }

  hasHiddenTypes() {
    return this.itemFilters.hiddenItemTypes.size > 0;
  }

  hasAnyActiveFilter() {
    return this.activeFilterCount() > 0;
  }

  /**
   * Shown on the Filters button in place of the chip strip, which is what used
   * to wrap the header onto extra rows. The chips themselves are a hover away
   * (the peek) or at the top of the sheet.
   */
  activeFilterCount() {
    return [
      !this.isLevelRangeDefault(),
      !this.itemFilters.showRaidItems,
      !this.itemFilters.showRareItems,
      this.hasHiddenPacks(),
      this.hasHiddenTypes()
    ].filter(Boolean).length;
  }

  resetLevelRange(event: Event) {
    event.stopPropagation();
    this.filters.setLevelRange(ItemFilters.MIN_LEVEL(), this.filters.getMaxLevel());
    this.analytics.track('reset_filter', { filter: 'level_range' });
  }

  resetRaidFilter(event: Event) {
    event.stopPropagation();
    this.filters.setShowRaidItems(true);
    this.analytics.track('reset_filter', { filter: 'raid_items' });
  }

  resetRareFilter(event: Event) {
    event.stopPropagation();
    this.filters.setShowRareItems(true);
    this.analytics.track('reset_filter', { filter: 'rare_items' });
  }

  resetHiddenPacks(event: Event) {
    event.stopPropagation();
    this.filters.setHiddenPacks(new Set());
    this.analytics.track('reset_filter', { filter: 'packs' });
  }

  resetHiddenTypes(event: Event) {
    event.stopPropagation();
    this.filters.setHiddenTypes(new Set());
    this.analytics.track('reset_filter', { filter: 'types' });
  }

  resetAllFilters(event: Event) {
    event.stopPropagation();
    this.filters.setLevelRange(ItemFilters.MIN_LEVEL(), this.filters.getMaxLevel());
    this.filters.setShowRaidItems(true);
    this.filters.setShowRareItems(true);
    this.filters.setHiddenPacks(new Set());
    this.filters.setHiddenTypes(new Set());
    this.analytics.track('reset_filter', { filter: 'all' });
  }

  /** The Filters button's tooltip: what's filtered, for a touch-free glance. */
  getHiddenPacksSummary() {
    const hiddenPackCount = this.itemFilters.hiddenPacks.size;
    return `${hiddenPackCount} pack${hiddenPackCount === 1 ? '' : 's'}`;
  }

  getHiddenTypesSummary() {
    const hiddenTypeCount = this.itemFilters.hiddenItemTypes.size;
    return `${hiddenTypeCount} type${hiddenTypeCount === 1 ? '' : 's'}`;
  }

  isArmorEquipped() {
    return this.equipped.hasItem('Armor');
  }

  shouldHighlightTrackedAffixes() {
    return this.trackedAffixesHint;
  }

  dismissIntro() {
    this.onboarding.dismissIntro();
    this.refreshOnboardingState();
  }

  dismissWrapUp() {
    this.onboarding.dismissWrapUp();
    this.refreshOnboardingState();
  }

  wrapUpSignIn() {
    this.analytics.track('wrap_up_action', { action: 'sign_in' });
    this.auth.signIn();
  }

  wrapUpOpenShoppingList() {
    this.analytics.track('wrap_up_action', { action: 'shopping_list' });
    this.dismissWrapUp();
    this.shoppingListView.open('wrap_up');
  }

  onTroveFileSelected(eventOrFile: Event | File) {
    let file: File | null;
    if (eventOrFile instanceof File) {
      file = eventOrFile;
    } else {
      const input = eventOrFile.target as HTMLInputElement;
      if (!input.files || input.files.length === 0) {
        this.troveUploadStatus = 'No file selected.';
        return;
      }
      file = input.files[0];
    }
    if (!file) {
      this.troveUploadStatus = 'No file selected.';
      return;
    }
    if (!file.name.endsWith('.csv')) {
      this.troveUploadStatus = 'Please upload a .csv file.';
      return;
    }
    this.troveUploadStatus = 'File loaded. Parsing...';
    const reader = new FileReader();
    reader.onload = () => {
      // readAsText always yields a string.
      const text = reader.result as string;
      const counts = this.userGear.importFromTroveCsv(text, this.getValidItemNames(), this.getTroveCraftingOptionNames());
      this.analytics.track('import_trove_csv', {
        imported_item_count_bucket: this.getImportCountBucket(counts.items),
        imported_augment_count_bucket: this.getImportCountBucket(counts.augments)
      });
      this.troveUploadStatus = `TroveExport.csv processed! ${counts.items} items and ${counts.augments} augments loaded.`;
    };
    reader.onerror = () => {
      this.troveUploadStatus = 'Error reading file.';
    };
    reader.readAsText(file);
  }

  private getValidItemNames(): Set<string> {
    return new Set(this.gearDb.getAllItemNames().map(troveNameKey));
  }

  private getTroveCraftingOptionNames(): Set<string> {
    return new Set(this.gearDb.getTroveTrackableCraftingOptionNames().map(troveNameKey));
  }

  private getImportCountBucket(count: number): string {
    if (count === 0) {
      return '0';
    }
    if (count <= 10) {
      return '1-10';
    }
    if (count <= 50) {
      return '11-50';
    }
    if (count <= 100) {
      return '51-100';
    }
    return '101+';
  }

  private refreshOnboardingState() {
    this.onboardingActive = this.onboarding.shouldShowOnboarding();
    this.wrapUpShown = this.onboarding.shouldShowWrapUp();
    this.trackedAffixesHint = this.isArmorEquipped() && this.onboardingActive && !this.isActiveTab('affixes');
  }
}
