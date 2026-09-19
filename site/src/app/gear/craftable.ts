import { CraftableOption } from './craftable-option';
import { AffixService } from '../affixes/affix.service';
import { isAugmentSystemName } from './augment-slots';

export class Craftable {
    name!: string;
    options!: Array<CraftableOption>;
    selected!: CraftableOption;
    isColoredAugmentSystem: boolean = false;
    craftingSystemOptions: string[] = [];
    selectedCraftingSystemName: string = '';
    private optionsByCraftingSystem: Map<string, CraftableOption[]> = new Map<string, CraftableOption[]>();
    private allOptionsByCraftingSystem: Map<string, CraftableOption[]> = new Map<string, CraftableOption[]>();

    constructor(name: string, options: Array<CraftableOption>, addEmptyOption: boolean = true) {
        // Mark all of the traditional, "colored" augment systems. They're numerous and get filtered out sometimes.
        this.isColoredAugmentSystem = !!name && isAugmentSystemName(name);

        this.name = name;
        if (addEmptyOption) {
            const emptyOption = new CraftableOption(null);
            this.options = [emptyOption].concat(options);
            this.selected = emptyOption;
        } else {
            this.options = options;
            this.selected = this.options[0];
        }
    }

    setCraftingSystemOptions(optionsByCraftingSystem: Map<string, CraftableOption[]>, selectedCraftingSystemName: string = '') {
        this.allOptionsByCraftingSystem = new Map<string, CraftableOption[]>();

        for (const [systemName, options] of optionsByCraftingSystem.entries()) {
            this.allOptionsByCraftingSystem.set(systemName, options.map(option => new CraftableOption(option)));
        }

        this.setAvailableCraftingSystemOptions(Array.from(optionsByCraftingSystem.keys()), selectedCraftingSystemName);
    }

    getOptionsByCraftingSystem() {
        const copy = new Map<string, CraftableOption[]>();
        for (const [systemName, options] of this.allOptionsByCraftingSystem.entries()) {
            copy.set(systemName, options.map(option => new CraftableOption(option)));
        }
        return copy;
    }

    setAvailableCraftingSystemOptions(systemNames: string[], selectedCraftingSystemName: string = '') {
        this.optionsByCraftingSystem = new Map<string, CraftableOption[]>();
        this.craftingSystemOptions = systemNames.filter(systemName => this.allOptionsByCraftingSystem.has(systemName));
        for (const systemName of this.craftingSystemOptions) {
            const options = this.allOptionsByCraftingSystem.get(systemName);
            if (options) {
                this.optionsByCraftingSystem.set(systemName, options.map(option => new CraftableOption(option)));
            }
        }

        // Refreshing the available systems shouldn't discard an augment chosen in a system that's still available.
        const previousSystemName = this.selectedCraftingSystemName;
        const previousDescription = this.selected?.getParamDescription() || '';

        this.selectCraftingSystem(this.craftingSystemOptions.includes(selectedCraftingSystemName) ? selectedCraftingSystemName : '');

        if (previousDescription && this.selectedCraftingSystemName && this.selectedCraftingSystemName === previousSystemName) {
            const previousOption = this.options.find(option => option.matchesParamDescription(previousDescription));
            if (previousOption) {
                this.selected = previousOption;
            }
        }
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

    // Options in different crafting systems can share a name (e.g. a Diamond is
    // available in both Colorless and Blue augment slots), so a selection made
    // within a system carries that system's name to be restored unambiguously.
    private static readonly SYSTEM_SELECTION_SEPARATOR = ': ';

    getSelectedParamDescription() {
        const selectedDescription = this.selected?.getParamDescription() || '';
        if (selectedDescription) {
            return this.selectedCraftingSystemName
                ? `${this.selectedCraftingSystemName}${Craftable.SYSTEM_SELECTION_SEPARATOR}${selectedDescription}`
                : selectedDescription;
        }

        if (this.selectedCraftingSystemName) {
            return `${this.selectedCraftingSystemName} (empty)`;
        }

        return '';
    }

    getMatchingBonusType(affixName: string, bonusType: string, affixSvc?: AffixService): number | null {
        for (const option of this.options) {
            const value = option.getMatchingBonusType(affixName, bonusType, affixSvc);
            if (value) {
                return value;
            }
        }

        return null;
    }

    selectMatchingBonusType(affixName: string, bonusType: string, affixSvc?: AffixService): boolean {
        for (const option of this.options) {
            const value = option.getMatchingBonusType(affixName, bonusType, affixSvc);
            if (value) {
                this.selected = option;
                return true;
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

            // Prefer the currently selected system for descriptions that don't
            // name one (older URLs), so a shared option name doesn't switch it.
            const currentSystemName = this.selectedCraftingSystemName;
            const systemNames = this.craftingSystemOptions.includes(currentSystemName)
                ? [currentSystemName].concat(this.craftingSystemOptions.filter(name => name !== currentSystemName))
                : this.craftingSystemOptions;

            for (const systemName of systemNames) {
                this.selectCraftingSystem(systemName);
                if (desc === `${systemName} (empty)`) {
                    return true;
                }

                const systemPrefix = `${systemName}${Craftable.SYSTEM_SELECTION_SEPARATOR}`;
                const optionDesc = desc.startsWith(systemPrefix) ? desc.substring(systemPrefix.length) : null;
                if (optionDesc === null && systemNames.some(name => desc.startsWith(`${name}${Craftable.SYSTEM_SELECTION_SEPARATOR}`))) {
                    // Names another system explicitly - not this one.
                    continue;
                }

                for (const option of this.options) {
                    if (option.matchesParamDescription(optionDesc ?? desc)) {
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
