import { Affix } from '../affixes/affix';
import { AffixService } from '../affixes/affix.service';
import { Craftable, CraftableOptionFilter } from './craftable';
import { CraftableOption } from './craftable-option';
import { CraftableInit, RawItem } from './game-data-types';
import { getPackKeys } from './pack-filter';

/** Raw item data, optionally with crafting slots given as objects rather than system names. */
export type ItemInit = Omit<RawItem, 'crafting'> & { crafting?: Array<string | CraftableInit | Craftable> };
import itemTypesList from '@data/item-types.json';

const itemTypes = itemTypesList as Record<string, { attributes: Array<string> }>;

export class Item {
    name!: string;
    slot!: string;
    type!: string;
    ml!: number;
    affixes: Array<Affix> = Array<Affix>();
    url!: string;
    rare!: boolean;
    private sets!: Array<string>;
    crafting!: Array<Craftable>;
    quests!: Array<string>;
    /** The pack filter keys of its sources (see pack-filter.ts), worked out once. */
    packKeys!: ReadonlyArray<string>;
    artifact!: boolean;

    rawCrafting: Array<string> = Array<string>();

    /**
     * Builds from raw items.json data (whose `crafting` lists system names,
     * resolved later by GearDbService), from an init object whose crafting
     * slots are objects or Craftables, or as a deep copy of another Item.
     * Craftables are always deep-copied.
     */
    constructor(json: ItemInit | Item | null) {
        if (!json) {
            return;
        }
        this.name = json.name;
        this.slot = json.slot;
        this.type = json.type || '';
        this.ml = Number(json.ml || 0);
        for (const affixJSON of json.affixes || []) {
            this.affixes.push(new Affix(affixJSON));
        }
        this.sets = (json instanceof Item ? json.sets : json.sets) || [];
        this.url = json.url || '';
        this.rare = !!json.rare;
        this.quests = json.quests || [];
        this.packKeys = json instanceof Item ? json.packKeys : getPackKeys(this.quests);
        this.artifact = !!json.artifact;
        this.crafting = Array<Craftable>();

        if (json instanceof Item) {
            this.rawCrafting = json.rawCrafting;
        }
        for (const crafting of json.crafting || []) {
            if (typeof crafting === 'string') {
                this.rawCrafting.push(crafting);
            } else if (crafting instanceof Craftable) {
                this.crafting.push(Item.copyCraftable(crafting));
            } else {
                const options = (crafting.options || []).map(option => new CraftableOption(option));
                this.crafting.push(new Craftable(crafting.name, options));
            }
        }
    }

    private static copyCraftable(source: Craftable): Craftable {
        return source.clone();
    }

    getSets(): string[] {
        const craftedSets: string[] = this.crafting?.map( (craftable) => craftable.selected.set ).filter( (set) => set ) ?? [];
        if (craftedSets.length > 0) {
            return craftedSets;
        } else {
            return this.sets;
        }
    }

    /** The sets the item belongs to on its own, which a set augment replaces (see getSets). */
    getOwnSets(): string[] {
        return this.sets?.slice() ?? [];
    }

    hasTypeAttribute(attribute: string) {
        return !!this.type && (itemTypes[this.type]?.attributes || []).includes(attribute);
    }

    isTwoHandedWeapon() {
        return this.hasTypeAttribute('weapon') && this.hasTypeAttribute('two-handed');
    }

    isCrossbow() {
        return !!this.type && /Crossbows$/.test(this.type);
    }

    isRuneArm() {
        return this.type === 'Rune Arms' || this.name === 'Essence Crafting Rune Arm';
    }

    isEssenceCrafted() {
        return this.crafting && this.crafting.find(opt => opt.name === 'Prefix');
    }

    isGeneratedEssenceCraftingBlank() {
        return !!this.name && this.name.startsWith('Essence Crafting ');
    }

    getURL() {
        return 'http://ddowiki.com' + this.url;
    }

    getActiveAffixes() {
        let activeAffixes = this.affixes.slice();

        if (this.crafting) {
            for (const craftable of this.crafting) {
                if (craftable.selected && craftable.selected.affixes) {
                    activeAffixes = activeAffixes.concat(craftable.selected.affixes);
                }
            }
        }

        return activeAffixes;
    }

    canHaveBonusType(affixName: string, bonusType: string, affixSvc: AffixService, allowColoredAugmentSystem: boolean = false) {
        return this.getMatchingBonusType(affixName, bonusType, affixSvc, allowColoredAugmentSystem) != null;
    }

    /**
     * Where the item gets the most of this affix and bonus type, and how much:
     * [null, value] for its own affixes, [crafting system, value] for a crafting
     * option `isAllowed` lets through (any, by default), or null if it can't have
     * it. Its own affixes win a tie, then the earlier crafting system.
     */
    getMatchingBonusType(
        affixName: string,
        bonusType: string,
        affixSvc: AffixService,
        allowColoredAugmentSystem: boolean = false,
        isAllowed?: CraftableOptionFilter
    ): [string | null, number] | null {
        const best = this._findBestMatch(affixName, bonusType, affixSvc, allowColoredAugmentSystem, isAllowed);
        return best ? [best.craftable?.name ?? null, best.value] : null;
    }

    /**
     * Selects the crafting option getMatchingBonusType reports. Changes nothing when the
     * item's own affixes give at least as much, as a crafted copy wouldn't stack with them.
     */
    selectMatchingBonusType(affixName: string, bonusType: string, affixSvc?: AffixService, isAllowed?: CraftableOptionFilter) {
        const best = this._findBestMatch(affixName, bonusType, affixSvc, false, isAllowed);
        if (best?.craftable && best.option) {
            best.craftable.selected = best.option;
        }
    }

    private _findBestMatch(
        affixName: string,
        bonusType: string,
        affixSvc: AffixService | undefined,
        allowColoredAugmentSystem: boolean,
        isAllowed: CraftableOptionFilter | undefined
    ): { craftable: Craftable | null, option: CraftableOption | null, value: number } | null {
        let best: { craftable: Craftable | null, option: CraftableOption | null, value: number } | null = null;
        for (const affix of this.affixes) {
            const ungroupedAffixes = affixSvc ? affixSvc.ungroupAffix(affix).concat(affix) : [affix];
            for (const ungroupedAffix of ungroupedAffixes) {
                if (ungroupedAffix.name === affixName && ungroupedAffix.type === bonusType
                    && (!best || Number(ungroupedAffix.value) > Number(best.value))) {
                    best = { craftable: null, option: null, value: ungroupedAffix.value };
                }
            }
        }

        for (const craftable of this.crafting ?? []) {
            // We sometimes want to skip the colored augments because they're so ubiquitous.
            if (!allowColoredAugmentSystem && craftable.isColoredAugmentSystem) {
                continue;
            }

            const match = craftable.getBestMatchingOption(affixName, bonusType, affixSvc, isAllowed);
            if (match && (!best || Number(match.value) > Number(best.value))) {
                best = { craftable, option: match.option, value: match.value };
            }
        }

        return best;
    }

    getValue(affixName: string, bonusType: string, affixSvc: AffixService, isAllowed?: CraftableOptionFilter) {
        const ret = this.getMatchingBonusType(affixName, bonusType, affixSvc, false, isAllowed);
        if (ret) {
            return ret[1];
        } else {
            return null;
        }
    }

    getCraftingByName(name: string) {
        if (!this.crafting) {
            return undefined;
        }

        for (const crafting of this.crafting) {
            if (crafting.name == name) {
                return crafting;
            }
        }
        return undefined;
    }
}
