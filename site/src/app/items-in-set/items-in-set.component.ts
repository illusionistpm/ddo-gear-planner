import { Component, OnInit, Input, ChangeDetectionStrategy } from '@angular/core';

import { GearDbService, SetBonusThreshold } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { Item } from '../gear/item';
import { AffixUiService } from '../affixes/affix-ui.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { DrawerEquipService } from '../suggestion-drawer/drawer-equip.service';
import { ItemPreviewController } from '../item-preview/item-preview-controller';

@Component({
    selector: 'app-items-in-set',
    templateUrl: './items-in-set.component.html',
    styleUrls: ['./items-in-set.component.css'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false
})
export class ItemsInSetComponent implements OnInit {
  @Input() setName!: string;

  matches!: Array<Item>;
  lockedMatches!: Array<Item>;
  /** Locked items whose slot is free: only the one-Minor-Artifact limit rules them out. */
  artifactLimited = new Set<Item>();
  setBonusTiers: Array<SetBonusThreshold> = [];
  equippedPieces = 0;
  readonly preview = new ItemPreviewController();

  constructor(
    public gearDB: GearDbService,
    public equipped: EquippedService,
    public affixUi: AffixUiService,
    private drawerEquip: DrawerEquipService,
    private suggestionDrawer: SuggestionDrawerService
  ) { }

  ngOnInit() {
    this.matches = [];
    this.lockedMatches = [];

    this.equippedPieces = this.equipped.getActiveSets().get(this.setName) || 0;
    this.setBonusTiers = this.gearDB.getSetBonusThresholdDetails(this.setName, this.equippedPieces);

    const matchingGear = this.equipped.getCompatibleGear(this.gearDB.findGearInSet(this.setName));
    const unlockedSlots = this.equipped.getUnlockedSlots();
    this.artifactLimited = new Set<Item>();
    for (const item of matchingGear) {
      if (!unlockedSlots.has(item.slot)) {
        this.lockedMatches.push(item);
      } else if (this.equipped.isBlockedByArtifactLimit(item)) {
        // Its slot is free, so the artifact limit is the only thing keeping it out.
        this.artifactLimited.add(item);
        this.lockedMatches.push(item);
      } else {
        this.matches.push(item);
      }
    }

    this.matches = this._sortBySlot(this.matches);
    this.lockedMatches = this._sortBySlot(this.lockedMatches);
  }

  _sortBySlot(array: Array<Item>) {
    return array.sort((a, b) =>
      a.slot.localeCompare(b.slot));
  }

  getSetBonusTooltip(tier: SetBonusThreshold): string {
    return tier.eligible
      ? `Active — ${tier.threshold} of ${this.setName} equipped`
      : this.affixUi.getSetBonusLockedTooltip(tier.threshold, this.equippedPieces);
  }

  equipItem(item: Item) {
    if (!this.equipped.canEquip(item)) {
      return;
    }

    this.drawerEquip.equip(item, 'set_modal');
  }

  equipPreviewItem(item: Item) {
    if (!this.equipped.canEquip(item)) {
      return;
    }

    const itemToEquip = new Item(item);
    this.drawerEquip.equip(itemToEquip, 'set_preview');
  }

  get canGoBack(): boolean {
    return this.suggestionDrawer.canGoBack;
  }

  goBack() {
    this.suggestionDrawer.back();
  }

  close() {
    this.suggestionDrawer.close();
  }
}
