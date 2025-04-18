import { Item } from './item';
import { Affix } from './affix';

export class AffixCloud {
    cloud: Map<string, Map<string, number>>;
    affixFrequency: Map<string, number>;

    constructor(itemList: Array<Item>) {
        this.cloud = new Map<string, Map<string, number>>();
        this.affixFrequency = new Map<string, number>();
        
        for (const item of itemList) {
            // reduce affixes to just their name and remove dupes
            const reducedAffixes = Array.from(new Set(item.affixes.map(e => e.name)));
            for (const affix1 of reducedAffixes) {
                let map = this.cloud.get(affix1);
                if (!map) {
                    map = new Map<string, number>();
                    this.cloud.set(affix1, map);
                }

                for (const affix2 of reducedAffixes) {
                    if (affix1 === affix2) {
                        continue;
                    }

                    let count = map.get(affix2);
                    if (count === undefined) {
                        count = 0;
                    }
                    map.set(affix2, count + 1);
                }

                let count = this.affixFrequency.get(affix1);
                if (count === undefined) {
                    count = 0;
                }
                this.affixFrequency.set(affix1, count + 1);
            }
        }

        // We have the total number of times an affix appears, as well as how often each affix appears with
        // another affix. We want to normalize the latter relationship with the total appearances.
        // However, I also need to balance against very rare affixes that only exist on like 1 item. They
        // would have a perfect relationship with everything else on their item and dominate the cloud.
        // Let's penalize anything that has less than 50 appearances.
        for (const entry of this.cloud.entries()) {
            const map = entry[1];
            for (const pair of map.entries()) {
                let count = this.affixFrequency.get(pair[0]);
                if (count !== undefined) {
                    if (count < 50) {
                        count = 50;
                    }
                        
                    map.set(pair[0], pair[1] / count);
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
