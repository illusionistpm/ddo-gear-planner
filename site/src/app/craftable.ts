import { CraftableOption } from './craftable-option';

export class Craftable {
    name: string;
    options: Array<CraftableOption>;
    selected: CraftableOption;

    constructor(name: string, options: Array<CraftableOption>) {
        this.name = name;
        this.options = options;
        this.selected = null;
    }
}
