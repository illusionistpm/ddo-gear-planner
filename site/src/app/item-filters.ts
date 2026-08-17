export class ItemFilters {

    public static MIN_LEVEL() { return 1; }
    public static MAX_LEVEL() { return 30; }
  
    levelRange: [number, number];

    showRaidItems: boolean;
    showRareItems: boolean;

    hiddenItemTypes: Set<string>;
    hiddenPacks: Set<string>;

    constructor(oldFilters: ItemFilters | null = null) {
        this.levelRange = [ItemFilters.MIN_LEVEL(), ItemFilters.MAX_LEVEL()];
        this.showRaidItems = true;
        this.showRareItems = true;
        this.hiddenItemTypes = new Set<string>();
        this.hiddenPacks = new Set<string>();

        if (oldFilters) {
            this.levelRange = oldFilters.levelRange;
            this.showRaidItems = oldFilters.showRaidItems;
            this.showRareItems = oldFilters.showRareItems;
            this.hiddenItemTypes = oldFilters.hiddenItemTypes;
            this.hiddenPacks = oldFilters.hiddenPacks;
        }
    }
}
