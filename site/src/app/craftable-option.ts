import { Affix } from './affix';

export class CraftableOption {
    affixes: Array<Affix>;

    constructor(json) {
        this.affixes = new Array<Affix>();

        if (json) {
            for (const affix of json.affixes) {
                this.affixes.push(new Affix(affix));
            }
        }
    }

    getMatchingBonusType(affixName, bonusType) {
        if (this.affixes) {
            for (const affix of this.affixes) {
                if (affix.name == affixName && affix.type == bonusType) {
                    return affix.value;
                }
            }
        }
        return null;
    }
}
