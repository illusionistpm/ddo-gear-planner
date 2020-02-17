import { Affix } from './affix';

export class CraftableOption {
    affixes: Array<Affix>;
    set: string;
    name: string;
    ml: number;

    constructor(json) {
        this.affixes = new Array<Affix>();

        if (json) {
            if (json.affixes) {
                for (const affix of json.affixes) {
                    this.affixes.push(new Affix(affix));
                }
            }

            this.set = json.set;

            if (json.name) {
                this.name = json.name;
            }

            if (json.ml) {
                this.ml = json.ml;
            }
        }
    }

    matchesParamDescription(desc: string) {
        return desc === this.getParamDescription();
    }

    getParamDescription() {
        if (this.name) {
            return this.name;
        } else if (this.set) {
            return this.set;
        } else if (this.affixes && this.affixes.length) {
            return this.affixes[0].name + this.affixes[0].value;
        }
        return '';
    }

    getMatchingBonusType(affixName, bonusType) {
        if (this.affixes) {
            for (const affix of this.affixes) {
                if (affix.name === affixName && affix.type === bonusType) {
                    return affix.value;
                }
            }
        }
        return null;
    }

    describe() {
        if (this.name && this.name.length) {
            return this.name;
        }
        if (this.set && this.set.length) {
            return this.set;
        }
        if (this.affixes && this.affixes.length) {
            let str = this.affixes[0].name + ' +' + this.affixes[0].value + ' ' + this.affixes[0].type;
            if (this.ml) {
                str += ' (ML ' + this.ml + ')';
            }
            return str;
        } else {
            return '';
        }
    }
}
