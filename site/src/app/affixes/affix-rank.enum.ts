export enum AffixRank {
    BetterThanBest,
    Best,
    BestTied,
    Outranked,
    Irrelevant,
    Penalty,
    Mixed
}

/** Rank class names, most useful to the build first. */
const RANK_CLASSES_BEST_FIRST = [
    AffixRank.BetterThanBest,
    AffixRank.Best,
    AffixRank.BestTied,
    AffixRank.Mixed,
    AffixRank.Outranked,
    AffixRank.Penalty,
    AffixRank.Irrelevant
].map(rank => AffixRank[rank]);

/**
 * Orders two rank class names (as `AffixUiService.getClassFor*` return them)
 * best first. A name that isn't a rank, or no name at all, sorts last.
 */
export function compareRankClasses(a: string | undefined, b: string | undefined): number {
    return rankClassIndex(a) - rankClassIndex(b);
}

/** The most useful of several rank class names; `Irrelevant` when there are none. */
export function bestRankClass(classNames: Array<string | undefined>): string {
    return classNames.reduce<string>((best, className) =>
        compareRankClasses(className, best) < 0 ? className! : best, AffixRank[AffixRank.Irrelevant]);
}

function rankClassIndex(className: string | undefined): number {
    const index = className ? RANK_CLASSES_BEST_FIRST.indexOf(className) : -1;
    return index < 0 ? RANK_CLASSES_BEST_FIRST.length : index;
}
