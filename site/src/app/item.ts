import { Affix } from './affix';
import { Craftable } from './craftable';

export class Item {
    name: string;
    slot: string;
    type: string;
    ml: number;
    affixes: Array<Affix> = Array<Affix>();
    url: string;
    private set: string;
    crafting: Array<Craftable>;
    quests: Array<string>;

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
            this.set = json.set;
            this.url = json.url;
            this.rawCrafting = json.crafting;
            this.crafting = json.crafting;
            this.quests = json.quests;
        }
    }

    getSet() {
        if (this.crafting) {
            for (const craftable of this.crafting) {
                if (craftable.selected.set) {
                    return craftable.selected.set;
                }
            }
        }
        return this.set;
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

    canHaveBonusType(affixName, bonusType) {
        return this.getMatchingBonusType(affixName, bonusType) != null;
    }

    getMatchingBonusType(affixName, bonusType) {
        for (const affix of this.affixes) {
            if (affix.name === affixName && affix.type === bonusType) {
                return [null, affix.value];
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

    getValue(affixName, bonusType) {
        const ret = this.getMatchingBonusType(affixName, bonusType);
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
