import { CraftableOption } from './craftable-option';

export class Craftable {
    name: string;
    options: Array<CraftableOption>;
    selected: CraftableOption;

    constructor(name: string, options: Array<CraftableOption>) {
        this.name = name;
        const emptyOption = new CraftableOption(null);
        this.options = [emptyOption].concat(options);
        this.selected = emptyOption;
    }

    getMatchingBonusType(affixName, bonusType) {
        for (const option of this.options) {
            const value = option.getMatchingBonusType(affixName, bonusType);
            if (value) {
                return value;
            }
        }

        return null;
    }

    selectMatchingBonusType(affixName, bonusType) {
        for (const option of this.options) {
            const value = option.getMatchingBonusType(affixName, bonusType);
            if (value) {
                this.selected = option;
                return true;
            }
        }
        return false;
    }

    selectByFirstAffixName(affixName: string) {
        for (const option of this.options) {
            if (option.affixes) {
                for (const affix of option.affixes) {
                    if (affix.name === affixName) {
                        this.selected = option;
                        return true;
                    }
                }
            }
        }
        return false;
    }
}
