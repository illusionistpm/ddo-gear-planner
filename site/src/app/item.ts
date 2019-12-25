import { Affix } from './affix';

export class Item {
    name: string;
    slot: string;
    type: string;
    ml: number;
    affixes: Array<Affix> = Array<Affix>();

    constructor(json) {
        if (json) {
            this.name = json.name;
            this.slot = json.slot ? json.slot : json.category;
            this.type = json.category;
            this.ml = Number(json.ml);
            for (const affixJSON of json.affixes) {
                this.affixes.push(new Affix(affixJSON));
            }
        }
    }
}
