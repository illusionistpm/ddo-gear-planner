import { CraftableOption } from './craftable-option';

export class Craftable {
    name: string;
    options: Array<CraftableOption>;
    selected: CraftableOption;

    constructor(name: string, options: Array<CraftableOption>) {
        this.name = name;
        let emptyOption = new CraftableOption();
        this.options = [emptyOption].concat(options);
        this.selected = emptyOption;
    }
}
