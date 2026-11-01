export enum AffixRank {
    BetterThanBest,
    Best,
    BestTied,
    Outranked,
    Irrelevant,
    Penalty,
    /** Parts that help alongside a part that is a penalty. */
    Mixed
}

/**
 * Modifier class for a compound rank - an affix group, or an option with several affixes - where
 * some parts help and others are outranked. It keeps the rank of the parts that help (an
 * outranked part adds nothing, but takes nothing away) and is shown in italics.
 */
export const PARTIAL_RANK_CLASS = 'PartialRank';

/** The class names for a rank, with the partial modifier when only some of it helps. */
export function rankClassName(rank: AffixRank, partial = false): string {
    return partial ? `${AffixRank[rank]} ${PARTIAL_RANK_CLASS}` : AffixRank[rank];
}

/** Ranks that add something to the build, most useful first. */
export const HELPFUL_RANKS: readonly AffixRank[] = [AffixRank.BetterThanBest, AffixRank.Best, AffixRank.BestTied];

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
 * best first, a partial rank just after the full one. A name that isn't a rank,
 * or no name at all, sorts last.
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
    const [rank, ...modifiers] = className ? className.split(' ') : [];
    const index = rank ? RANK_CLASSES_BEST_FIRST.indexOf(rank) : -1;
    if (index < 0) {
        return RANK_CLASSES_BEST_FIRST.length * 2;
    }
    return index * 2 + (modifiers.includes(PARTIAL_RANK_CLASS) ? 1 : 0);
}
