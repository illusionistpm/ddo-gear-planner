/**
 * Turns gear lists into planner builds - not a test. Skipped unless SUGGESTION_EVAL_GEAR_LISTS names
 * a JSON file of lists:
 *
 *   [{ "name": "...", "items": { "Helm": "Legendary Helm of the Crownblade", ... },
 *      "packages": ["Basic", "Melee"], "spellpower": ["Fire"], "extra": ["Strength"] }, ...]
 *
 *   SUGGESTION_EVAL_GEAR_LISTS=lists.json SUGGESTION_EVAL_GEAR_LISTS_OUT=builds.json \
 *     npx ng test --watch=false --include src/app/suggestion-eval/gear-lists.spec.ts
 *
 * Each list is equipped at level 28-34 with its bundles tracked and encoded the way a saved build is
 * stored, so real-builds.spec.ts can rank it like an export (tools/build-stats/README.md). Builds
 * posted as text (forum guides) come in this way. Crafting is left empty: lists seldom say it.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';

import { AffixPackagesService } from '../affixes/affix-packages.service';
import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { QueryParamRecord } from '../build/query-param-types';
import { GearDbService } from '../gear/gear-db.service';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';

const LISTS_FILE = process.env['SUGGESTION_EVAL_GEAR_LISTS'];
const OUT_FILE = process.env['SUGGESTION_EVAL_GEAR_LISTS_OUT'];

interface GearList {
  name: string;
  items: Record<string, string>;
  packages?: string[];
  spellpower?: string[];
  extra?: string[];
}

describe.skipIf(!LISTS_FILE)('gear lists', () => {
  it('encodes gear lists as builds', () => {
    const lists: GearList[] = JSON.parse(readFileSync(LISTS_FILE!, 'utf8'));
    TestBed.configureTestingModule({});
    const filters = TestBed.inject(FiltersService);
    // After GearDbService exists: creating it sets the filters' max level, which resets the range.
    const gearDB = TestBed.inject(GearDbService);
    filters.setLevelRange(28, 34);
    const equipped = TestBed.inject(EquippedService);
    const packages = TestBed.inject(AffixPackagesService);
    const codec = TestBed.inject(BuildUrlCodecService);

    const builds = [];
    let missing = 0;
    for (const list of lists) {
      for (const slot of equipped.getSlotNames()) {
        equipped.clearSlot(slot);
      }
      for (const [slot, name] of Object.entries(list.items)) {
        const item = (gearDB.getFilteredGearBySlot(slot) ?? []).find(candidate => candidate.name === name);
        if (item) {
          equipped.set(item);
        } else {
          missing++;
        }
      }
      const tracked = new Set(list.extra ?? []);
      list.packages?.forEach(name => packages.packages.get(name)?.forEach(affix => tracked.add(affix)));
      list.spellpower?.forEach(name => packages.spellpowerPackages.get(name)?.forEach(affix => tracked.add(affix)));
      equipped.setImportantAffixes(Array.from(tracked));
      equipped._updateRouterState();
      filters._updateRouterState();
      // QueryParamsService only collects these once the router's first navigation is done, which
      // never happens here, so read each service's own record (both are private BehaviorSubjects).
      const record = {
        ...(filters['params'] as unknown as BehaviorSubject<QueryParamRecord>).getValue(),
        ...(equipped['params'] as unknown as BehaviorSubject<QueryParamRecord>).getValue(),
      };
      builds.push({ source: 'saved', owner: list.name, name: list.name, blob: codec.encode(record), createdAt: '' });
    }
    writeFileSync(OUT_FILE!, JSON.stringify({ builds }, null, 1));
    console.log(`${builds.length} builds, ${missing} items not found`);
    expect(builds.length).toBe(lists.length);
  });
});
