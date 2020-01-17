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
        }
    }

    getURL() {
        return 'http://ddowiki.com' + this.url;
    }

    getActiveAffixes() {
        const activeAffixes = this.affixes.slice();
        for (const craftable of this.crafting) {
            if (craftable.selected) {
                activeAffixes.concat(craftable.selected.affixes);
            }
        }
        return activeAffixes;
    }
}
