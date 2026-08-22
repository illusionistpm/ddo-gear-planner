import { CraftableOption } from './craftable-option';
import { AffixService } from './affix.service';

export class Craftable {
    name!: string;
    options!: Array<CraftableOption>;
    selected!: CraftableOption;
    hiddenFromAffixSearch!: boolean;
    isColoredAugmentSystem: boolean = false;
    craftingSystemOptions: string[] = [];
    selectedCraftingSystemName: string = '';
    private optionsByCraftingSystem: Map<string, CraftableOption[]> = new Map<string, CraftableOption[]>();

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

    setCraftingSystemOptions(optionsByCraftingSystem: Map<string, CraftableOption[]>, selectedCraftingSystemName: string = '') {
        this.optionsByCraftingSystem = new Map<string, CraftableOption[]>();
        this.craftingSystemOptions = Array.from(optionsByCraftingSystem.keys());

        for (const [systemName, options] of optionsByCraftingSystem.entries()) {
            this.optionsByCraftingSystem.set(systemName, options.map(option => new CraftableOption(option)));
        }

        this.selectCraftingSystem(selectedCraftingSystemName);
    }

    getOptionsByCraftingSystem() {
        const copy = new Map<string, CraftableOption[]>();
        for (const [systemName, options] of this.optionsByCraftingSystem.entries()) {
            copy.set(systemName, options.map(option => new CraftableOption(option)));
        }
        return copy;
    }

    selectCraftingSystem(systemName: string) {
        this.selectedCraftingSystemName = systemName;
        const emptyOption = new CraftableOption(null);
        if (!systemName) {
            this.options = [emptyOption];
            this.selected = emptyOption;
            return;
        }

        const options = this.optionsByCraftingSystem.get(systemName) || [];
        this.options = [emptyOption].concat(options.map(option => new CraftableOption(option)));
        this.selected = emptyOption;
    }

    hasCraftingSystemOptions() {
        return this.craftingSystemOptions.length > 0;
    }

    getSelectedParamDescription() {
        const selectedDescription = this.selected?.getParamDescription() || '';
        if (selectedDescription) {
            return selectedDescription;
        }

        if (this.selectedCraftingSystemName) {
            return `${this.selectedCraftingSystemName} (empty)`;
        }

        return '';
    }

    getMatchingBonusType(affixName: string, bonusType: string, affixSvc?: AffixService): number | null {
        if (!this.hiddenFromAffixSearch) {
            for (const option of this.options) {
                const value = option.getMatchingBonusType(affixName, bonusType, affixSvc);
                if (value) {
                    return value;
                }
            }
        }

        return null;
    }

    selectMatchingBonusType(affixName: string, bonusType: string, affixSvc?: AffixService): boolean {
        if (!this.hiddenFromAffixSearch) {
            for (const option of this.options) {
                const value = option.getMatchingBonusType(affixName, bonusType, affixSvc);
                if (value) {
                    this.selected = option;
                    return true;
                }
            }
        }
        
        return false;
    }

    selectByParamDescription(desc: string) {
        if (this.hasCraftingSystemOptions()) {
            if (desc === '') {
                this.selectCraftingSystem('');
                return true;
            }

            for (const systemName of this.craftingSystemOptions) {
                this.selectCraftingSystem(systemName);
                if (desc === `${systemName} (empty)`) {
                    return true;
                }

                for (const option of this.options) {
                    if (option.matchesParamDescription(desc)) {
                        this.selected = option;
                        return true;
                    }
                }
            }

            this.selectCraftingSystem('');
            return desc === '';
        }

        for (const option of this.options) {
            if (option.matchesParamDescription(desc)) {
                this.selected = option;
                return true;
            }
        }
        return false;
    }
}
