import {
  getStoredActiveTab,
  getStoredCollapsedTrackedAffixGroups,
  getStoredHideIrrelevantCraftingOptions,
  getStoredTrackedAffixGroupMode,
  storeActiveTab,
  storeCollapsedTrackedAffixGroups,
  storeHideIrrelevantCraftingOptions,
  storeTrackedAffixGroupMode
} from './planner-view-state-storage';

describe('planner-view-state-storage', () => {
  const keys = [
    'ddo-gear-planner-active-tab',
    'ddo-gear-planner-tracked-affix-group-mode',
    'ddo-gear-planner-tracked-affix-collapsed',
    'ddo-gear-planner-hide-irrelevant-crafting-options'
  ];

  beforeEach(() => {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  });

  afterEach(() => {
    for (const key of keys) {
      localStorage.removeItem(key);
    }
  });

  it('hides irrelevant crafting options when nothing is stored', () => {
    expect(getStoredHideIrrelevantCraftingOptions()).toBe(true);
  });

  it('round-trips hiding irrelevant crafting options', () => {
    storeHideIrrelevantCraftingOptions(false);
    expect(getStoredHideIrrelevantCraftingOptions()).toBe(false);
    storeHideIrrelevantCraftingOptions(true);
    expect(getStoredHideIrrelevantCraftingOptions()).toBe(true);
  });

  it('defaults active tab to equipment when nothing is stored', () => {
    expect(getStoredActiveTab()).toBe('equipment');
  });

  it('round-trips the active tab', () => {
    storeActiveTab('affixes');
    expect(getStoredActiveTab()).toBe('affixes');
  });

  it('defaults tracked-affix group mode to category when nothing is stored', () => {
    expect(getStoredTrackedAffixGroupMode()).toBe('category');
  });

  it('round-trips the tracked-affix group mode', () => {
    storeTrackedAffixGroupMode('slots');
    expect(getStoredTrackedAffixGroupMode()).toBe('slots');
  });

  it('starts the Scarcity view\'s Filigree and Advanced bonuses collapsed, and nothing else', () => {
    expect(getStoredCollapsedTrackedAffixGroups()).toEqual(new Set(['filigree', 'item-bonuses']));
  });

  it('round-trips collapsed tracked-affix groups', () => {
    storeCollapsedTrackedAffixGroups(new Set(['Defense', 'set-only', 'filigree', 'item-bonuses']));
    expect(getStoredCollapsedTrackedAffixGroups()).toEqual(new Set(['Defense', 'set-only', 'filigree', 'item-bonuses']));
  });

  it('keeps a group that starts collapsed open once the player opens it', () => {
    storeCollapsedTrackedAffixGroups(new Set(['item-bonuses']));
    expect(getStoredCollapsedTrackedAffixGroups()).toEqual(new Set(['item-bonuses']));
  });

  it('keeps a Filigree group collapsed before this default, collapsed', () => {
    localStorage.setItem('ddo-gear-planner-tracked-affix-collapsed', 'filigree,Defense');
    expect(getStoredCollapsedTrackedAffixGroups()).toEqual(new Set(['filigree', 'Defense', 'item-bonuses']));
  });
});
