export class SlotValList {
    private list: Array<any>;

    constructor() {
        this.list = [];
    }

    push(slot: string, value: number) {
        this.list.push({slot, value});
    }

    getBestValue() {
        let bestValue = 0;
        for (const pair of this.list) {
            if (pair.value > bestValue) {
                bestValue = pair.value;
            }
        }

        return bestValue;
    }
}
