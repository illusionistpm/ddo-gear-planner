export class Affix {
    name: string;
    value: number;
    type: string;
    description: string;

    static isRealType(type: string) {
        return type !== 'Bool';
    }

    constructor(json) {
        this.name = json.name;
        this.value = Number(json.value);
        this.type = json.type;
    }

    hasRealType() {
        return Affix.isRealType(this.type);
    }
}
