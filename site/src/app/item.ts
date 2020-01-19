import { Affix } from './affix';
import { SlicePipe } from '@angular/common';
import { Craftable } from './craftable';

export class Item {
    name: string;
    slot: string;
    type: string;
    ml: number;
    affixes: Array<Affix> = Array<Affix>();
    url: string;
    crafting: Array<Craftable>;

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
            this.url = json.url;
            this.rawCrafting = json.crafting;
            this.crafting = json.crafting;
        }
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

    getValue(affixName, bonusType) {
        const ret = this.getMatchingBonusType(affixName, bonusType);
        if (ret) {
            return ret[1];
        } else {
            return null;
        }
    }
}
