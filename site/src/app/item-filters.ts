export class ItemFilters {

    public static MIN_LEVEL() { return 1; }
    public static MAX_LEVEL() { return 30; }
  
    levelRange: [number, number];

    showRaidItems: boolean;

    constructor(oldFilters: ItemFilters = null) {
        this.levelRange = [ItemFilters.MIN_LEVEL(), ItemFilters.MAX_LEVEL()];
        this.showRaidItems = true;

        if (oldFilters) {
            this.levelRange = oldFilters.levelRange;
            this.showRaidItems = oldFilters.showRaidItems;
        }
    }
}
