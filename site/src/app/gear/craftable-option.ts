import { Affix } from '../affixes/affix';
import { AffixService } from '../affixes/affix.service';
import { CraftableOptionInit } from './game-data-types';
import { getPackKeys } from './pack-filter';

/**
 * An unnamed option travels in build URLs as its affixes' names and values (see
 * getParamDescription), so a data fix that rescales a value would orphan saved builds.
 * These map each description a saved URL may still carry to the one the data emits now.
 *
 * - Wizardry tiers became spell points (Wizardry VI = 150, Wizardry X = 250) on the
 *   Prismatic Cloak options. No option carries Wizardry 6 or 10 any more.
 * - Unnumbered enchantments stopped being Bool next to typed affixes of the same name:
 *   plain Deception is Improved Deception +3, plain Finesse is Finesse +2, and plain
 *   Underwater Action (breathing only) is Water Breathing. Dream Edge's random effects
 *   and the Underwater Action Essence Crafting option carried the old names. Nothing
 *   carries Deception 1, Finesse 1 or Underwater Action 1 any more.
 * - Immunities became "Immunity to X": Blindness Immunity is Immunity to Blindness on the
 *   Essence Crafting option and Legendary Green Steel's T1 (Equipment) option. (Petrification
 *   and Web Immunity are only on named options and items, which don't travel this way.)
 *
 * A rescale whose old value depends on the item's ML can't be a single entry here: the
 * option carries its own (see legacyParamDescriptions, and EssenceCraftingService for the
 * elemental resistances that used the saves progression).
 */
const LEGACY_PARAM_DESCRIPTIONS: Readonly<Record<string, string>> = {
    'Wizardry6': 'Wizardry150',
    'Wizardry10': 'Wizardry250',
    'Deception1': 'Improved Deception3',
    'Finesse1': 'Finesse2',
    'Underwater Action1': 'Water Breathing1',
    'Blindness Immunity1': 'Immunity to Blindness1',
    'Blindness Immunity1|Proof Against Disease4': 'Immunity to Blindness1|Proof Against Disease4',
};

export class CraftableOption {
    // One choice in a crafting system. Immutable once built: the gear database shares each
    // option between every item and Craftable that offers it, rather than copying it per item
    // (copying was 2.5 million options and ~550MB for the full item list). State that changes -
    // which option is selected - lives on the Craftable.
    readonly affixes: ReadonlyArray<Affix>;
    readonly set: string = '';
    readonly name: string = '';
    readonly ml: number = 0;
    /** Where it drops, first source first. Empty for an option that follows its host item. */
    readonly quests: ReadonlyArray<string>;
    /** The pack filter keys of its sources (see pack-filter.ts). */
    readonly packKeys: ReadonlyArray<string>;
    /**
     * What a system's "nothing selected" option shows as, when that isn't simply empty
     * (an upgrade-tier item with no upgrade is at Tier 1). Display only: the option
     * still travels in URLs as the empty selection.
     */
    readonly emptyLabel: string;
    /**
     * Descriptions saved build URLs may carry for this very option, from before a data fix
     * revalued it. For rescales LEGACY_PARAM_DESCRIPTIONS can't express, because the old
     * value depends on which option (and ML) it is.
     */
    private readonly legacyParamDescriptions: ReadonlyArray<string>;

    constructor(json: CraftableOptionInit | null, emptyLabel: string = '', legacyParamDescriptions: ReadonlyArray<string> = []) {
        this.emptyLabel = emptyLabel;
        this.legacyParamDescriptions = legacyParamDescriptions;
        this.affixes = (json?.affixes ?? []).map(affix => new Affix(affix));
        this.quests = json?.quests ?? [];
        this.packKeys = getPackKeys(this.quests);

        if (json) {
            this.set = json.set ?? '';

            if (json.name) {
                this.name = json.name;
            }

            if (json.ml) {
                this.ml = json.ml;
            }
        }
    }

    /**
     * Whether a character of at most `maxLevel` can use this option. Only the top of a
     * level range excludes an option: one below the minimum still slots in, and some
     * effects only exist at low levels.
     */
    isWithinMaxLevel(maxLevel: number) {
        return !this.ml || this.ml <= maxLevel;
    }

    matchesParamDescription(desc: string) {
        const own = this.getParamDescription();
        return desc === own
            || (Object.hasOwn(LEGACY_PARAM_DESCRIPTIONS, desc) && LEGACY_PARAM_DESCRIPTIONS[desc] === own)
            || this.legacyParamDescriptions.includes(desc);
    }

    getParamDescription() {
        if (this.name) {
            return this.name;
        } else if (this.set) {
            return this.set;
        } else if (this.affixes && this.affixes.length) {
            return this.affixes.map(affix => affix.name + affix.value).join('|');
        }
        return '';
    }

    getMatchingBonusType(affixName: string, bonusType: string, affixSvc?: AffixService): number | null {
        if (this.affixes) {
            for (const affix of this.affixes) {
                const affixesToCheck = affixSvc ? affixSvc.ungroupAffix(affix).concat(affix) : [affix];
                for (const affixToCheck of affixesToCheck) {
                    if (affixToCheck.name === affixName && affixToCheck.type === bonusType) {
                        return affixToCheck.value;
                    }
                }
            }
        }
        return null;
    }

    describe(includeValue: boolean = true, includeML: boolean = true) {
        if (this.name && this.name.length) {
            return this.name;
        }
        if (this.set && this.set.length) {
            return this.set;
        }
        if (this.affixes && this.affixes.length) {
            let str = this.affixes.map(affix => this.describeAffix(affix, includeValue)).join(', ');

            if (this.ml && includeML) {
                str += ' (ML ' + this.ml + ')';
            }
            return str;
        } else {
            return this.emptyLabel;
        }
    }

    private describeAffix(affix: Affix, includeValue: boolean = true) {
        let str = affix.name;
        if (affix.hasRealType()) {
            if (includeValue) {
                str += ' +' + affix.value;
            }
            str += ' ' + affix.type;
        }
        return str;
    }
}
