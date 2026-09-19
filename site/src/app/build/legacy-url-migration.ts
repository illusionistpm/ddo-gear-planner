import {
  storeActiveTab,
  storeCollapsedTrackedAffixGroups,
  storeTrackedAffixGroupMode
} from '../planner/planner-view-state-storage';

// One-time compatibility shims for URL shapes that existed before a specific
// refactor and should self-upgrade on next load, kept separate from
// BuildUrlCodecService's permanent flat-param-vs-compact-payload fallback
// decoding (a steady-state contract, not a one-time migration).
//
// Called from main.ts, before Angular bootstraps - NOT from a component.
// The Router kicks off its own default "initial navigation" targeting
// whatever window.location already is, scheduled as a microtask right after
// the root component is created. A component-level fix that issued a
// corrective router.navigateByUrl() raced that default navigation and lost
// (the later-scheduled default navigation cancels the earlier in-flight
// one), leaving the app on the empty root route. Mutating window.location
// directly, before the Router exists, means there's only ever one
// navigation - the Router's own default one - and it already targets the
// corrected URL.
export function migrateLegacyUrlIfNeeded(): void {
  rewriteLegacyHashUrl();
  migrateLegacyViewStateParams();
}

// Pre-path-routing links looked like `/#/main?levelrange=1,36&...`. Now that
// HashLocationStrategy is gone, that fragment is invisible to the router, so
// rewrite it into the equivalent path-based URL before anything else runs.
function rewriteLegacyHashUrl(): void {
  const rawHash = window.location.hash;
  if (!rawHash || !rawHash.startsWith('#/')) {
    return;
  }

  const pathAndQuery = rawHash.slice(1);
  history.replaceState(null, '', pathAndQuery);
}

// tab/taGroup/taCollapsed used to round-trip through the URL as UI view
// state (see planner-view-state-storage.ts for why that moved to
// localStorage). Existing bookmarked/shared links may still carry them -
// migrate their values into localStorage instead of just discarding them,
// so no one's existing preference silently resets. Must run after
// rewriteLegacyHashUrl() above, so a pre-path-routing hash link's query
// string has already landed in window.location.search by the time this
// reads it. The params themselves are left in place here; they get dropped
// from the address bar the ordinary way, the next time anything triggers a
// URL rewrite (e.g. the compact-payload codec re-encoding the build).
function migrateLegacyViewStateParams(): void {
  const params = new URLSearchParams(window.location.search);

  const tab = params.get('tab');
  if (tab === 'affixes') {
    storeActiveTab('affixes');
  }

  const taGroup = params.get('taGroup');
  if (taGroup === 'slots') {
    storeTrackedAffixGroupMode('slots');
  }

  const taCollapsed = params.get('taCollapsed');
  if (taCollapsed) {
    storeCollapsedTrackedAffixGroups(new Set(taCollapsed.split(',').filter(Boolean)));
  }
}
