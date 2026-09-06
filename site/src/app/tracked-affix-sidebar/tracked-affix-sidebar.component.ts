import { Component, Input, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Subscription } from 'rxjs';

import { SummaryGroup } from '../tracked-affix-summary.service';
import { TrackedAffixSummaryService } from '../tracked-affix-summary.service';
import { SuggestionDrawerService } from '../suggestion-drawer/suggestion-drawer.service';
import { AffixBuilderDrawerService } from '../affix-builder-drawer/affix-builder-drawer.service';
import { EquippedService } from '../equipped.service';
import { getAffixGroupCssClass } from '../affix-organization';

@Component({
  selector: 'app-tracked-affix-sidebar',
  templateUrl: './tracked-affix-sidebar.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class TrackedAffixSidebarComponent implements OnInit, OnDestroy {
  @Input() sortOwnedToTop = true;

  groups: SummaryGroup[] = [];
  collapsedGroups = new Set<string>();

  private subscription?: Subscription;

  constructor(
    private summary: TrackedAffixSummaryService,
    private suggestionDrawer: SuggestionDrawerService,
    private affixBuilder: AffixBuilderDrawerService,
    private equipped: EquippedService
  ) {}

  openBuilder() {
    this.affixBuilder.open('edit');
  }

  openFullView() {
    this.equipped.setActiveMainTab('affixes');
  }

  ngOnInit() {
    this.subscription = this.summary.getSummaryGroups().subscribe(groups => {
      this.groups = groups;
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  toggleGroup(name: string) {
    if (this.collapsedGroups.has(name)) {
      this.collapsedGroups.delete(name);
    } else {
      this.collapsedGroups.add(name);
    }
  }

  isGroupCollapsed(name: string): boolean {
    return this.collapsedGroups.has(name);
  }

  get trackedCount(): number {
    return this.groups.reduce((total, group) => total + group.count, 0);
  }

  openSuggestions(sourceAffixName: string, sourceBonusType: string) {
    this.suggestionDrawer.openBonusType(sourceAffixName, sourceBonusType, this.sortOwnedToTop);
  }

  removeAffix(affixName: string, event?: Event) {
    event?.stopPropagation();
    this.equipped.removeImportantAffix(affixName);
  }

  trackGroup(index: number, group: SummaryGroup): string {
    return group.name;
  }

  getGroupClass(groupName: string): string {
    return getAffixGroupCssClass(groupName);
  }
}
