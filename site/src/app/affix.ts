export class Affix {
    name: string;
    value: number;
    type: string;

    constructor(json) {
        this.name = json.name;
        this.value = Number(json.value);
        this.type = json.bonusType;
    }}
