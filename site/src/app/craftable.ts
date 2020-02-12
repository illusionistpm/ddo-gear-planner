import { CraftableOption } from './craftable-option';

export class Craftable {
    name: string;
    options: Array<CraftableOption>;
    selected: CraftableOption;
    hiddenFromAffixSearch: boolean;

    constructor(name: string, options: Array<CraftableOption>, hiddenFromAffixSearch: boolean) {
        this.name = name;
        const emptyOption = new CraftableOption(null);
        this.options = [emptyOption].concat(options);
        this.selected = emptyOption;
        this.hiddenFromAffixSearch = (hiddenFromAffixSearch === undefined) || hiddenFromAffixSearch;
    }

    getMatchingBonusType(affixName, bonusType) {
        if (!this.hiddenFromAffixSearch) {
            for (const option of this.options) {
                const value = option.getMatchingBonusType(affixName, bonusType);
                if (value) {
                    return value;
                }
            }
        }

        return null;
    }

    selectMatchingBonusType(affixName, bonusType) {
        if (!this.hiddenFromAffixSearch) {
            for (const option of this.options) {
                const value = option.getMatchingBonusType(affixName, bonusType);
                if (value) {
                    this.selected = option;
                    return true;
                }
            }
        }
        
        return false;
    }

    selectByParamDescription(desc: string) {
        for (const option of this.options) {
            if (option.matchesParamDescription(desc)) {
                this.selected = option;
                return true;
            }
        }
        return false;
    }
}
