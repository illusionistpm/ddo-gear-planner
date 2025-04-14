import { CraftableOption } from './craftable-option';

export class Craftable {
    name: string;
    options: Array<CraftableOption>;
    selected: CraftableOption;
    hiddenFromAffixSearch: boolean;
    isColoredAugmentSystem: boolean = false;

    constructor(name: string, options: Array<CraftableOption>, hiddenFromAffixSearch: boolean, addEmptyOption: boolean = true) {
        // Mark all of the traditional, "colored" augment systems. They're numerous and get filtered out sometimes.
        ['Blue ', 'Yellow ', 'Red ', 'Purple ', 'Orange ', 'Green ', 'Colorless '].forEach(color => {
            if (name && name.startsWith(color)) {
                this.isColoredAugmentSystem = true;
            }
        });

        this.name = name;
        if (addEmptyOption) {
            const emptyOption = new CraftableOption(null);
            this.options = [emptyOption].concat(options);
            this.selected = emptyOption;
        } else {
            this.options = options;
            this.selected = this.options[0];
        }
        this.hiddenFromAffixSearch = hiddenFromAffixSearch;
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
