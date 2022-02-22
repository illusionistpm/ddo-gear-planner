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
            this.crafting = json.crafting;
            this.quests = json.quests;
            this.artifact = json.artifact;
        }
    }

    getSets() {
        if (this.crafting) {
            for (const craftable of this.crafting) {
                if (craftable.selected.set) {
                    return [craftable.selected.set];
                }
            }
        }
        return this.sets;
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

    canHaveBonusType(affixName, bonusType, affixSvc: AffixService) {
        return this.getMatchingBonusType(affixName, bonusType, affixSvc) != null;
    }

    getMatchingBonusType(affixName, bonusType, affixSvc: AffixService) {
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
