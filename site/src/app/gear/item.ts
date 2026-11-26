import { Affix } from '../affixes/affix';
import { AffixService } from '../affixes/affix.service';
import { Craftable, CraftableOptionFilter } from './craftable';
import { CraftableOption } from './craftable-option';
import { CraftableInit, RawItem, WeaponDamage } from './game-data-types';
import { ITEM_BONUS_KINDS, ItemBonuses } from './item-bonus';
import { getPackKeys } from './pack-filter';

/** Raw item data, optionally with crafting slots given as objects rather than system names. */
export type ItemInit = Omit<RawItem, 'crafting'> & { crafting?: Array<string | CraftableInit | Craftable> };
import itemTypesList from '@data/item-types.json';

const itemTypes = itemTypesList as Record<string, { attributes: Array<string>; critical?: string }>;

/** One of an item's own affixes as shown after its chosen upgrades (Item.getUpgradedOwnAffixes). */
export interface UpgradedAffix {
    affix: Affix;
    /** The item's own affix this one replaced, or null if it's the item's own. */
    replaced: Affix | null;
    /** The chosen option that replaced it. */
    by: CraftableOption | null;
}

export class Item {
    name!: string;
    slot!: string;
    type!: string;
    ml!: number;
    affixes: Array<Affix> = Array<Affix>();
    url!: string;
    rare!: boolean;
    // Defaulted, so an item built bare (`new Item(null)`, then filled in) still has none rather than undefined.
    private sets: Array<string> = [];
    crafting!: Array<Craftable>;
    quests!: Array<string>;
    /** The pack filter keys of its sources (see pack-filter.ts), worked out once. */
    packKeys!: ReadonlyArray<string>;
    artifact!: boolean;
    /** A weapon's [W] multiplier and dice, or null (not a weapon, or the wiki lists none). */
    damage: WeaponDamage | null = null;
    /** Its own critical profile where it differs from its type's; see getCriticalProfile. */
    private critical = '';
    /** The Mythic Boost, Reaper bonus and Curse this copy carries. Game data's items carry none. */
    bonuses: ItemBonuses = {};

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
        this.damage = json.damage ?? null;
        this.critical = (json instanceof Item ? json.critical : json.critical) ?? '';
        this.crafting = Array<Craftable>();

        if (json instanceof Item) {
            this.rawCrafting = json.rawCrafting;
            // The options are immutable and shared, so copying the map is a full copy.
            this.bonuses = { ...json.bonuses };
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
        return this.sets.slice();
    }

    hasTypeAttribute(attribute: string) {
        return !!this.type && (itemTypes[this.type]?.attributes || []).includes(attribute);
    }

    /** A weapon's critical profile ("19-20/x2"): its own, else its type's; '' for anything else. */
    getCriticalProfile(): string {
        return this.critical || (this.damage ? itemTypes[this.type]?.critical ?? '' : '');
    }

    /** A weapon's damage as the wiki writes it, "5.8[1d8+2]"; '' without one. */
    getDamageDescription(): string {
        return this.damage ? `${+this.damage.w.toFixed(2)}[${this.damage.dice}]` : '';
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

    /**
     * Whether a crafting slot can be used. A slot another slot's option adds - the augment
     * slot an upgrade tier adds - is there only while a chosen option adds it; any other
     * slot always is. (Augment Slot 2's own rule is isCraftingSlotAvailable's.)
     */
    isCraftingSlotOpen(craftable: Craftable): boolean {
        let added = false;
        for (const other of this.crafting ?? []) {
            if (other === craftable) {
                continue;
            }
            if (other.selected?.addsCrafting.includes(craftable.name)) {
                return true;
            }
            added ||= other.canAddCraftingSystem(craftable.name);
        }
        return !added;
    }

    /**
     * Whether the item's other choices allow this option. One that must share an element
     * with other tiers (Legendary Alchemical Tier 3 takes Tier 1's or Tier 2's) is allowed
     * while one of them is still empty - it can yet be crafted to match - or matches.
     */
    isOptionAllowed(option: CraftableOption): boolean {
        if (!option.elementFrom.length) {
            return true;
        }
        return option.elementFrom.some(systemName => {
            const chosen = this.getCraftingByName(systemName)?.selected?.element;
            return !chosen || chosen === option.element;
        });
    }

    /** The options chosen in its open crafting slots. */
    private chosenOptions(): CraftableOption[] {
        return (this.crafting ?? [])
            .filter(craftable => craftable.selected && this.isCraftingSlotOpen(craftable))
            .map(craftable => craftable.selected);
    }

    /**
     * Its own affixes as its chosen upgrades leave them: one an option replaces shows as
     * the option's affix that takes its place (`replaced` holding the original, `by` the
     * option), or not at all if nothing does. The option's other affixes aren't here.
     */
    getUpgradedOwnAffixes(): UpgradedAffix[] {
        const chosen = this.chosenOptions().filter(option => option.replaces.length);
        const shown: UpgradedAffix[] = [];
        for (const affix of this.affixes) {
            const by = chosen.find(option => option.replacesAffix(affix));
            if (!by) {
                shown.push({ affix, replaced: null, by: null });
                continue;
            }
            const replacement = by.replacementFor(affix);
            if (replacement && !shown.some(row => row.affix === replacement)) {
                shown.push({ affix: replacement, replaced: affix, by });
            }
        }
        return shown;
    }

    getActiveAffixes() {
        const chosen = this.chosenOptions();
        let activeAffixes = this.affixes.filter(affix => !chosen.some(option => option.replacesAffix(affix)));

        for (const option of chosen) {
            if (option.affixes) {
                activeAffixes = activeAffixes.concat(option.affixes);
            }
        }

        for (const kind of ITEM_BONUS_KINDS) {
            const bonus = this.bonuses[kind];
            if (bonus) {
                activeAffixes = activeAffixes.concat(bonus.affixes);
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
            // A slot an upgrade adds isn't there to fill until the upgrade is chosen.
            if (!this.isCraftingSlotOpen(craftable)) {
                continue;
            }

            const match = craftable.getBestMatchingOption(affixName, bonusType, affixSvc,
                option => this.isOptionAllowed(option) && (!isAllowed || isAllowed(option)));
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
