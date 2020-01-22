import { Item } from './item';
import { Affix } from './affix';

export class AffixCloud {
    cloud: Map<string, Map<string, number>>;

    constructor(itemList: Array<Item>) {
        this.cloud = new Map<string, Map<string, number>>();
        for (const item of itemList) {
            for (const affix1 of item.affixes) {
                for (const affix2 of item.affixes) {
                    if (affix1 === affix2) {
                        continue;
                    }

                    let map = this.cloud.get(affix1.name);
                    if (!map) {
                        map = new Map<string, number>();
                        this.cloud.set(affix1.name, map);
                    }

                    let count = map.get(affix2.name);
                    if (count === undefined) {
                        count = 0;
                    }
                    map.set(affix2.name, count + 1);
                }
            }
        }
    }

    get(affix: string) {
        return this.cloud.get(affix);
    }

    merge(set1, set2) {
        const result = set1;
        for (const pair of set2.entries()) {
            let count = set1.get(pair[0]);
            if (count === undefined) {
                count = 0;
            }
            result.set(pair[0], count + pair[1]);
        }

        return result;
    }
}
