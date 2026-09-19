import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, combineLatest, distinctUntilChanged, take } from 'rxjs';

import { AffixBuilderDrawerService } from '../affix-builder-drawer/affix-builder-drawer.service';
import { AffixPackagesService } from '../affixes/affix-packages.service';
import { UserGearService } from '../planner/user-gear.service';
import { GearDbService } from '../gear/gear-db.service';
import { AnalyticsService } from '../shared/analytics.service';
import { FiltersService } from '../planner/filters.service';
import { ItemFilters } from '../gear/item-filters';
import { EquippedService, PlannerTab } from '../planner/equipped.service';
import { PlannerOnboardingService } from '../planner/planner-onboarding.service';
import { ThemeService } from '../shared/theme.service';
import { AuthService } from '../shared/auth.service';
import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { BuildsService } from '../build/builds.service';
import { CurrentBuildService } from '../build/current-build.service';
import { QueryParamsService } from '../build/query-params.service';


@Component({
    selector: 'app-main',
    templateUrl: './main.component.html',
    styleUrls: ['./main.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class MainComponent implements OnInit, OnDestroy {
  troveUploadStatus: string = '';
  sortOwnedToTop: boolean = true;
  activeTab: PlannerTab = 'equipment';
  filtersOpen: boolean = false;
  itemFilters = new ItemFilters();
  onboardingActive = true;
  trackedAffixesHint = false;
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
    private affixBuilder: AffixBuilderDrawerService,
    private affixPackages: AffixPackagesService,
    private sanitizer: DomSanitizer,
    private route: ActivatedRoute,
    private router: Router,
    private buildsService: BuildsService,
    private buildUrlCodec: BuildUrlCodecService,
    private queryParams: QueryParamsService,
    private currentBuild: CurrentBuildService,
    private auth: AuthService
  ) {
    this.supportPopoverUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      'https://www.buymeacoffee.com/widget/page/illusionistpm'
      + '?description=' + encodeURIComponent('Support me on Buy me a coffee!')
      + '&color=' + encodeURIComponent('#5F7FFF')
    );
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
    // applied, but the real target navigation hasn't landed yet - opening
    // setup here would show a real, visible flash of the "no build" screen
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
          this.onParamsReapplied();
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
    this.filterSubscription = this.filters.getItemFilters().subscribe(itemFilters => {
      this.itemFilters = itemFilters;
    });
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

  ngOnDestroy() {
    this.filterSubscription?.unsubscribe();
    this.onboardingSubscription?.unsubscribe();
    this.tabSubscription?.unsubscribe();
    this.routeParamsSubscription?.unsubscribe();
    this.buildIdentitySubscription?.unsubscribe();
    this.initialParamsAppliedSubscription?.unsubscribe();
    this.ownershipMemoAuthSubscription?.unsubscribe();
    for (const slotSubscription of this.slotSubscriptions) {
      slotSubscription.unsubscribe();
    }
  }

  // Params applied again after the page was already up. "New build" lands here: MainComponent is
  // recreated by the navigation to '/', but its first pass ran against the previous build's state
  // (see the note above the subscription in ngOnInit), so it's this later application of the
  // now-empty URL that has to treat the page like a fresh visit.
  private onParamsReapplied() {
    if (!this.latestRouteShortId && this.equipped.isBuildEmpty() && !this.equipped.getImportantAffixes().size) {
      this.maybeOpenAffixBuilderOnLoad();
    }
  }

  private maybeOpenAffixBuilderOnLoad() {
    const firstRun = this.onboarding.shouldShowOnboarding() || !this.equipped.getImportantAffixes().size;
    if (firstRun) {
      // A genuinely empty URL - start them on Basic rather than a blank page. A build that's already
      // got gear (or a saved id) but nothing tracked is theirs to leave as it is.
      if (!this.latestRouteShortId && this.equipped.isBuildEmpty()) {
        this.affixPackages.addDefaultPackage();
      }
      this.affixBuilder.open('setup');
    } else if (this.affixBuilder.mode === 'setup') {
      // A prior call (against the pre-load empty state) opened the setup
      // screen speculatively; real build data has since landed, so correct
      // course rather than leaving it stuck open over an actual build.
      this.affixBuilder.close();
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
    // Only on the genuine false->true transition, never on every call - by
    // this point real build data (or a legitimate empty scratch build) is
    // already applied, since isLoadingBuild only goes false after
    // applyDecodedBuildParams has already run (see loadBuildFromRoute).
    // Previously this ran unconditionally from inside the initialGate
    // combineLatest subscriber in ngOnInit, which for a build route fires
    // immediately on subscribe (isLoading$/initialParamsApplied$ already
    // cached "ready" from the prior root-page instance) - before
    // getByShortId's fetch had returned. Evaluating the "first-run" heuristic
    // against that still-empty equipment state opened the affix builder's
    // setup drawer (which isn't gated by contentReady) for the whole fetch,
    // then closed it again once real data landed - which is what actually
    // caused the "start page" flash chased across this whole conversation,
    // not a contentReady bug at all.
    // Also skipped on a load error: contentReady going true there means
    // "stop showing the boot splash, the error panel takes over instead"
    // (see the template), not "real build data just landed" - there's
    // nothing here for the first-run heuristic to evaluate.
    if (!previous && this.contentReady && !this.loadError) {
      this.maybeOpenAffixBuilderOnLoad();
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
        // Best-effort, and deliberately NOT memoized: a failed check still
        // degrades ownership to 'other' (so "Save a copy" stays reachable
        // instead of the save control sitting disabled forever - see
        // CurrentBuildService.confirmOwnership's comment), but a transient
        // blip gets a genuine retry the next time this shortId's identity
        // is restored, rather than caching the failure as if it were an
        // answer.
        error: () => this.currentBuild.confirmOwnership(shortId, null)
      });
    });
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

  isActiveTab(tab: PlannerTab) {
    return this.activeTab === tab;
  }

  toggleFilters() {
    this.filtersOpen = !this.filtersOpen;
  }

  toggleTheme() {
    this.theme.toggleTheme();
  }

  // Buy Me a Coffee's own floating widget always animates in from the bottom
  // corner (its script hardcodes that), which looked disconnected once the
  // trigger moved into the top bar. Its support form is just an embeddable
  // page (https://www.buymeacoffee.com/widget/page/<slug>), so show that in a
  // small popover anchored under our own button instead.
  readonly supportPopoverUrl: SafeResourceUrl;
  supportPopoverOpen = false;

  toggleSupportPopover() {
    this.supportPopoverOpen = !this.supportPopoverOpen;
  }

  closeSupportPopover() {
    this.supportPopoverOpen = false;
  }

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
    return !this.isLevelRangeDefault()
      || !this.itemFilters.showRaidItems
      || !this.itemFilters.showRareItems
      || this.hasHiddenPacks()
      || this.hasHiddenTypes();
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
      const validNames = this.getValidItemNames();
      const count = this.userGear.importFromTroveCsv(text, validNames);
      this.analytics.track('import_trove_csv', {
        imported_item_count_bucket: this.getImportCountBucket(count)
      });
      this.troveUploadStatus = `TroveExport.csv processed! ${count} items loaded.`;
    };
    reader.onerror = () => {
      this.troveUploadStatus = 'Error reading file.';
    };
    reader.readAsText(file);
  }

  private getValidItemNames(): Set<string> {
    return new Set(this.gearDb.getAllItemNames().map(name => name.trim().toLowerCase()));
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
    this.trackedAffixesHint = this.isArmorEquipped() && this.onboardingActive && !this.isActiveTab('affixes');
  }
}
