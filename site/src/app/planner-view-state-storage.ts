import type { PlannerTab, TrackedAffixGroupMode } from './equipped.service';

// The active planner tab and tracked-affix grouping/collapse state used to
// round-trip through the URL (tab/taGroup/taCollapsed) solely so a reload
// wouldn't lose them - not because they're meaningfully part of "the
// build". Persisting them here instead (same try/catch-guarded localStorage
// pattern as theme.service.ts) means they survive a reload without a URL
// round trip, are remembered per-browser across different builds instead of
// resetting each time one loads, and never end up in a shared/saved build's
// URL or blob.
const ACTIVE_TAB_KEY = 'ddo-gear-planner-active-tab';
const TRACKED_AFFIX_GROUP_MODE_KEY = 'ddo-gear-planner-tracked-affix-group-mode';
const TRACKED_AFFIX_COLLAPSED_KEY = 'ddo-gear-planner-tracked-affix-collapsed';

export function getStoredActiveTab(): PlannerTab {
  return readValue(ACTIVE_TAB_KEY) === 'affixes' ? 'affixes' : 'equipment';
}

export function storeActiveTab(tab: PlannerTab): void {
  writeValue(ACTIVE_TAB_KEY, tab);
}

export function getStoredTrackedAffixGroupMode(): TrackedAffixGroupMode {
  return readValue(TRACKED_AFFIX_GROUP_MODE_KEY) === 'slots' ? 'slots' : 'category';
}

export function storeTrackedAffixGroupMode(mode: TrackedAffixGroupMode): void {
  writeValue(TRACKED_AFFIX_GROUP_MODE_KEY, mode);
}

export function getStoredCollapsedTrackedAffixGroups(): Set<string> {
  const raw = readValue(TRACKED_AFFIX_COLLAPSED_KEY);
  return new Set(raw ? raw.split(',').filter(Boolean) : []);
}

export function storeCollapsedTrackedAffixGroups(groups: ReadonlySet<string>): void {
  writeValue(TRACKED_AFFIX_COLLAPSED_KEY, Array.from(groups).join(','));
}

function readValue(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeValue(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in private browsing or tests.
  }
}
