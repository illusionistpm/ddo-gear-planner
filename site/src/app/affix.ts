export class Affix {
    name: string = '';
    value: number = 0;
    type: string = '';
    description: string = '';

    static isRealType(type: string) {
        return type !== 'Bool';
    }

    constructor(json: any) {
        this.name = json?.name ?? '';
        this.value = Number(json?.value ?? 0);
        this.type = json?.type ?? '';
    }

    hasRealType() {
        return Affix.isRealType(this.type);
    }
}
