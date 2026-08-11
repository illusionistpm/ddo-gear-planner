import { Affix } from './affix';
import { AffixService } from './affix.service';

export class CraftableOption {
    affixes: Array<Affix> = new Array<Affix>();
    set: string = '';
    name: string = '';
    ml: number = 0;

    constructor(json: any) {
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
            return this.affixes.map(affix => affix.name + affix.value).join('|');
        }
        return '';
    }

    getMatchingBonusType(affixName: string, bonusType: string, affixSvc?: AffixService): number | null {
        if (this.affixes) {
            for (const affix of this.affixes) {
                const affixesToCheck = affixSvc ? affixSvc.ungroupAffix(affix).concat(affix) : [affix];
                for (const affixToCheck of affixesToCheck) {
                    if (affixToCheck.name === affixName && affixToCheck.type === bonusType) {
                        return affixToCheck.value;
                    }
                }
            }
        }
        return null;
    }

    describe(includeValue: boolean = true, includeML: boolean = true) {
        if (this.name && this.name.length) {
            return this.name;
        }
        if (this.set && this.set.length) {
            return this.set;
        }
        if (this.affixes && this.affixes.length) {
            let str = this.affixes.map(affix => this.describeAffix(affix, includeValue)).join(', ');

            if (this.ml && includeML) {
                str += ' (ML ' + this.ml + ')';
            }
            return str;
        } else {
            return '';
        }
    }

    private describeAffix(affix: Affix, includeValue: boolean = true) {
        let str = affix.name;
        if (affix.hasRealType()) {
            if (includeValue) {
                str += ' +' + affix.value;
            }
            str += ' ' + affix.type;
        }
        return str;
    }
}
