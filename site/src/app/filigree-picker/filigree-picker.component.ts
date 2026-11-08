import {
  AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, ViewChild
} from '@angular/core';
import { NgClass } from '@angular/common';

import { AffixService } from '../affixes/affix.service';
import { FiligreeDbService } from '../gear/filigree-db.service';
import { FiligreeChoice, FiligreeHost, filigreeAffixes } from '../gear/filigree';
import { EquippedService } from '../planner/equipped.service';
import {
  FiligreeGroupMode, getStoredFiligreeGroupMode, getStoredHideIrrelevantFiligree, storeFiligreeGroupMode,
  storeHideIrrelevantFiligree
} from '../planner/planner-view-state-storage';
import { buildFiligreeGroups, FiligreeEntry, FiligreeFacts, FiligreeGroup } from './filigree-picker-rows';

/**
 * Picks the filigree for one slot of the weapon or artifact. Standalone and loaded on first use
 * (see FiligreeSlotsComponent), so its list and logic stay out of the initial bundle.
 *
 * Inputs only, no outputs: ngComponentOutlet can't bind outputs, so the host passes callbacks.
 */
@Component({
  selector: 'app-filigree-picker',
  templateUrl: './filigree-picker.component.html',
  styleUrls: ['./filigree-picker.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgClass]
})
export class FiligreePickerComponent implements OnChanges, AfterViewInit {
  @Input() host: FiligreeHost = 'weapon';
  @Input() index = 0;
  @Input() current: FiligreeChoice | null = null;
  @Input() pick: (choice: FiligreeChoice | null) => void = () => {};
  @Input() close: () => void = () => {};

  @ViewChild('searchBox') searchBox?: ElementRef<HTMLInputElement>;

  search = '';
  rare = false;
  hideIrrelevant = getStoredHideIrrelevantFiligree();
  mode: FiligreeGroupMode = getStoredFiligreeGroupMode();
  groups: FiligreeGroup[] = [];
  hiddenCount = 0;

  private facts: FiligreeFacts[] | null = null;

  constructor(
    private filigreeDb: FiligreeDbService,
    private equipped: EquippedService,
    private affixSvc: AffixService,
    private changeDetector: ChangeDetectorRef
  ) { }

  ngOnChanges() {
    this.rare = !!this.current?.rare;
    this.refresh();
  }

  ngAfterViewInit() {
    // On touch screens the keyboard would cover the list, so the search box waits to be tapped.
    const finePointer = typeof window.matchMedia !== 'function' || window.matchMedia('(pointer: fine)').matches;
    if (finePointer) {
      this.searchBox?.nativeElement.focus();
    }
  }

  onSearch(value: string) {
    this.search = value;
    this.refresh();
  }

  onRare(rare: boolean) {
    this.rare = rare;
    this.refresh();
  }

  onHideIrrelevant(hide: boolean) {
    this.hideIrrelevant = hide;
    storeHideIrrelevantFiligree(hide);
    this.refresh();
  }

  setMode(mode: FiligreeGroupMode) {
    this.mode = mode;
    storeFiligreeGroupMode(mode);
    this.refresh();
  }

  choose(entry: FiligreeEntry) {
    this.pick({ name: entry.name, rare: this.rare });
  }

  remove() {
    this.pick(null);
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.close();
    }
  }

  private refresh() {
    this.facts ??= this.buildFacts();
    const choices = this.host === 'weapon'
      ? this.equipped.getFiligreeLoadout().weapon
      : this.equipped.getFiligreeLoadout().artifact;
    // The slot being changed doesn't count against itself.
    const inHost = new Set(choices
      .filter((choice, slot): choice is FiligreeChoice => !!choice && slot !== this.index)
      .map(choice => choice.name));
    const { groups, hiddenCount } = buildFiligreeGroups(this.facts, {
      mode: this.mode,
      isTracked: name => this.equipped.isImportantAffix(name),
      inHost,
      search: this.search,
      hideIrrelevant: this.hideIrrelevant,
      rare: this.rare,
      current: this.current?.name,
    });
    this.groups = groups;
    this.hiddenCount = hiddenCount;
    this.changeDetector.markForCheck();
  }

  private buildFacts(): FiligreeFacts[] {
    const names = (affixes: ReturnType<typeof filigreeAffixes>) =>
      [...new Set(this.affixSvc.flattenAffixGroups(affixes, true).map(affix => affix.name))];
    return this.filigreeDb.getNames().map(name => {
      const raw = this.filigreeDb.get(name)!;
      const setBonuses = raw.sets.flatMap(set => this.filigreeDb.getSetBonus(set, Number.MAX_SAFE_INTEGER));
      return {
        name,
        sets: raw.sets,
        affixes: filigreeAffixes(raw, false),
        rareAffixes: filigreeAffixes({ ...raw, affixes: [] }, true),
        ownBonusNames: names(filigreeAffixes(raw, false)),
        rareBonusNames: names(filigreeAffixes({ ...raw, affixes: [] }, true)),
        setBonusNames: names(setBonuses),
      };
    });
  }
}
