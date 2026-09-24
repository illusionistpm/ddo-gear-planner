import { Affix } from '../affixes/affix';
import { AffixService } from '../affixes/affix.service';
import { Craftable } from './craftable';
import { CraftableOption } from './craftable-option';
import { CraftableInit, RawItem } from './game-data-types';

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
    pack!: string;
    rare!: boolean;
    private sets!: Array<string>;
    crafting!: Array<Craftable>;
    quests!: Array<string>;
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
        this.pack = json.pack || '';
        this.rare = !!json.rare;
        this.quests = json.quests || [];
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

    getMatchingBonusType(affixName: string, bonusType: string, affixSvc: AffixService, allowColoredAugmentSystem: boolean = false) {
        for (const affix of this.affixes) {
            let ungroupedAffixes = affixSvc.ungroupAffix(affix);
            ungroupedAffixes = ungroupedAffixes.concat(affix);

            for (const ungroupedAffix of ungroupedAffixes) {
                if (ungroupedAffix.name === affixName && ungroupedAffix.type === bonusType) {
                    return [null, ungroupedAffix.value];
                }
            }
        }

        if (this.crafting) {
            for (const craftable of this.crafting) {
                // We sometimes want to skip the colored augments because they're so ubiquitous.
                if (!allowColoredAugmentSystem && craftable.isColoredAugmentSystem) {
                    continue;
                }

                const value = craftable.getMatchingBonusType(affixName, bonusType, affixSvc);
                if (value) {
                    return [craftable.name, value];
                }
            }
        }

        return null;
    }

    selectMatchingBonusType(affixName: string, bonusType: string, affixSvc?: AffixService) {
        if (this.crafting) {
            for (const craftable of this.crafting) {
                if (craftable.selectMatchingBonusType(affixName, bonusType, affixSvc)) {
                    break;
                }
            }
        }
    }

    getValue(affixName: string, bonusType: string, affixSvc: AffixService) {
        const ret = this.getMatchingBonusType(affixName, bonusType, affixSvc);
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
