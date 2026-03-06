import { Affix } from './affix';
import { AffixService } from './affix.service';
import { Craftable } from './craftable';

export class Item {
    name: string;
    slot: string;
    type: string;
    ml: number;
    affixes: Array<Affix> = Array<Affix>();
    url: string;
    private sets: Array<string>;
    crafting: Array<Craftable>;
    quests: Array<string>;
    artifact: boolean;

    rawCrafting: Array<string> = Array<string>();

    constructor(json) {
        if (json) {
            this.name = json.name;
            this.slot = json.slot;
            this.type = json.type;
            this.ml = Number(json.ml);
            for (const affixJSON of json.affixes) {
                this.affixes.push(new Affix(affixJSON));
            }
            this.sets = json.sets;
            this.url = json.url;
            this.rawCrafting = json.crafting;
            if (json.crafting) {
                this.crafting = Array<Craftable>();
                const addEmptyItem = !(json instanceof Craftable);
                for (const craftingJSON of json.crafting) {
                    this.crafting.push(new Craftable(craftingJSON.name, craftingJSON.options, craftingJSON.hiddenFromAffixSearch, addEmptyItem));
                }
            }
            this.quests = json.quests;
            this.artifact = json.artifact;
        }
    }

    getSets(): string[] {
        const craftedSets: string[] = this.crafting?.map( (craftable) => craftable.selected.set ).filter( (set) => set ) ?? [];
        if (craftedSets.length > 0) {
            return craftedSets;
        } else {
            return this.sets;
        }
    }

    isValid() {
        return this.name !== undefined;
    }

    isCannithCrafted() {
        return this.crafting && this.crafting.find(opt => opt.name === 'Prefix');
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

    canHaveBonusType(affixName, bonusType, affixSvc: AffixService, allowColoredAugmentSystem: boolean = false) {
        return this.getMatchingBonusType(affixName, bonusType, affixSvc, allowColoredAugmentSystem) != null;
    }

    getMatchingBonusType(affixName, bonusType, affixSvc: AffixService, allowColoredAugmentSystem: boolean = false) {
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

                const value = craftable.getMatchingBonusType(affixName, bonusType);
                if (value) {
                    return [craftable.name, value];
                }
            }
        }

        return null;
    }

    selectMatchingBonusType(affixName, bonusType) {
        if (this.crafting) {
            for (const craftable of this.crafting) {
                if (craftable.selectMatchingBonusType(affixName, bonusType)) {
                    break;
                }
            }
        }
    }

    getValue(affixName, bonusType, affixSvc: AffixService) {
        const ret = this.getMatchingBonusType(affixName, bonusType, affixSvc);
        if (ret) {
            return ret[1];
        } else {
            return null;
        }
    }

    getCraftingByName(name: string) {
        for (const crafting of this.crafting) {
            if (crafting.name == name) {
                return crafting;
            }
        }
    }
}
