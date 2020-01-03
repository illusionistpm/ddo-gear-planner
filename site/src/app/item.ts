import { Affix } from './affix';

export class Item {
    name: string;
    slot: string;
    type: string;
    ml: number;
    affixes: Array<Affix> = Array<Affix>();
    url: string;

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
        }
    }

    getURL() {
        return 'http://ddowiki.com' + this.url;
    }
}
