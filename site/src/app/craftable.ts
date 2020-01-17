import { CraftableOption } from './craftable-option';

export class Craftable {
    options: Array<CraftableOption>
    selected: CraftableOption

    constructor(json) {
        this.options = json.options;
        this.selected = null;
    }
}
