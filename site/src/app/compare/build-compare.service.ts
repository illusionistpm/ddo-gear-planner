import { Injectable } from '@angular/core';

import { AffixService } from '../affixes/affix.service';
import { AffixTotalRules } from '../affixes/build-totals';
import { visibleTypeRulesOf } from '../affixes/tracked-affix-derivation';
import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { EssenceCraftingService } from '../gear/essence-crafting.service';
import { FiligreeDbService } from '../gear/filigree-db.service';
import { GearDbService } from '../gear/gear-db.service';
import { ItemBonusService } from '../gear/item-bonus.service';
import { BuildModel, buildModelOf, snapshotFromBlob } from '../planner/build-snapshot';
import { BuildComparison, compareBuilds } from './build-comparison';

/**
 * Reads saved builds and compares them, with the game data the pure functions need. Touches
 * nothing of the planner's: the builds are never loaded into it.
 */
@Injectable({ providedIn: 'root' })
export class BuildCompareService {
  private readonly rules: AffixTotalRules;
  // A build is read again only when its blob changes (a refetch usually returns the same one).
  private readonly models = new Map<string, BuildModel | null>();

  constructor(
    private readonly codec: BuildUrlCodecService,
    private readonly gearDb: GearDbService,
    private readonly essenceCrafting: EssenceCraftingService,
    private readonly filigreeDb: FiligreeDbService,
    private readonly affixSvc: AffixService,
    private readonly itemBonuses: ItemBonusService
  ) {
    this.rules = visibleTypeRulesOf(gearDb, affixSvc);
  }

  /** A saved build's gear and what it adds up to; null for a blob this client can't read. */
  modelOf(blob: string): BuildModel | null {
    if (!this.models.has(blob)) {
      if (this.models.size > 8) {
        this.models.clear();
      }
      const snapshot = snapshotFromBlob(blob, {
        codec: this.codec, gearDb: this.gearDb, essenceCrafting: this.essenceCrafting,
        filigreeDb: this.filigreeDb, affixSvc: this.affixSvc, itemBonuses: this.itemBonuses,
      });
      this.models.set(blob, snapshot && buildModelOf(snapshot, {
        gearDb: this.gearDb, filigreeDb: this.filigreeDb, affixSvc: this.affixSvc,
      }));
    }
    return this.models.get(blob) ?? null;
  }

  compare(a: BuildModel, b: BuildModel): BuildComparison {
    return compareBuilds(a, b, { affixSvc: this.affixSvc, rules: this.rules });
  }
}
