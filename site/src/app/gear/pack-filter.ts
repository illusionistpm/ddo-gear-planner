import questList from '@data/quests.json';

/**
 * The pack filter's key for free content: a source the pack map doesn't name, or
 * something with no source at all. It travels in build URLs' hiddenpacks, and the
 * data builder's URL codec dictionary holds it too, so it must not change.
 */
export const NO_PACK_KEY = '__NO_PACK__';

/**
 * Filter-only groups the data builder puts in the pack map alongside real adventure
 * packs (data-builder/item_sources.py PSEUDO_PACKS). The filter lists them after free
 * quests and before the real packs.
 */
export const PSEUDO_PACKS: ReadonlyArray<string> = ['DDO Store', 'Events'];

/**
 * quests.json's 'packs': every source the data emits -> its pack, keyed by the exact
 * name, so no normalising is needed here. A source missing from it is free.
 */
const sourcePacks: Readonly<Record<string, string>> = questList.packs;

/** quests.json's 'packInfo': when a pack came out, and whether it is an expansion. */
export interface PackInfo {
    /** ISO date, so it sorts as text. */
    readonly released: string;
    readonly expansion: boolean;
}

const packInfo: Readonly<Record<string, PackInfo>> = questList.packInfo;

/** Null for the pseudo-packs and free content, which the wiki's pack tables don't list. */
export function getPackInfo(pack: string): PackInfo | null {
    return Object.hasOwn(packInfo, pack) ? packInfo[pack] : null;
}

/**
 * quests.json's 'coupons': a coupon code that unlocked a list of packs for free, oldest
 * first. Most players own packs because they redeemed one, so the filter offers each as
 * a shortcut for its packs.
 */
export interface PackCoupon {
    /** The wiki's column heading: the year for a yearly coupon, else a nickname. */
    readonly label: string;
    /** The dates it could be redeemed, as the wiki writes them. */
    readonly available: string;
    /** Empty when the wiki's code list and table disagree. */
    readonly code: string;
    readonly packs: ReadonlyArray<string>;
}

export const PACK_COUPONS: ReadonlyArray<PackCoupon> = questList.coupons;

// Shared: most crafting options have no sources.
const FREE_ONLY: ReadonlyArray<string> = Object.freeze([NO_PACK_KEY]);

/** The pack a source belongs to, or null when it is free. */
export function getSourcePack(source: string): string | null {
    return Object.hasOwn(sourcePacks, source) ? sourcePacks[source] : null;
}

/**
 * The pack filter keys of something from these sources: each source's pack, with free
 * sources as NO_PACK_KEY. No sources at all is free too.
 */
export function getPackKeys(sources: ReadonlyArray<string>): ReadonlyArray<string> {
    if (!sources.length) {
        return FREE_ONLY;
    }
    return Array.from(new Set(sources.map(source => getSourcePack(source) ?? NO_PACK_KEY)));
}

/** Hidden only when every one of its packs is: it still drops somewhere shown otherwise. */
export function isHiddenByPacks(packKeys: ReadonlyArray<string>, hiddenPacks: ReadonlySet<string>): boolean {
    return hiddenPacks.size > 0 && packKeys.every(key => hiddenPacks.has(key));
}

/**
 * A crafting option with no sources is never pack-filtered: it follows its host item
 * (Nearly Complete, Slaver's, Cannith) or is generic random loot (the colorless
 * "Diamond of ..." augments). One with sources is filtered like an item.
 */
export function isOptionHiddenByPacks(
    option: { readonly quests: ReadonlyArray<string>, readonly packKeys: ReadonlyArray<string> },
    hiddenPacks: ReadonlySet<string>
): boolean {
    return option.quests.length > 0 && isHiddenByPacks(option.packKeys, hiddenPacks);
}
