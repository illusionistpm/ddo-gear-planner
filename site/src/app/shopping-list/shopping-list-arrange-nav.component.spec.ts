import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { ShoppingEntry } from '../planner/shopping-list/shopping-list-types';
import { buildShoppingListView } from '../planner/shopping-list/shopping-list-view-model';
import { AnalyticsService } from '../shared/analytics.service';
import { ShoppingListArrangeNavComponent } from './shopping-list-arrange-nav.component';

function at(quest: string, pack: string): ShoppingEntry {
  return {
    key: `g|${quest}`, kind: 'gear', identity: `gear|${quest}`, label: quest, system: null, ml: 0,
    sources: [{ quest, pack, raid: false, wikiUrl: `wiki/${quest}` }], sourceInherited: false,
    rare: false, artifact: false, wikiUrl: null, troveName: null, parentKey: null, details: [],
  };
}

describe('ShoppingListArrangeNavComponent', () => {
  let fixture: ComponentFixture<ShoppingListArrangeNavComponent>;
  let arranger: { arrangePacks: ReturnType<typeof vi.fn>; arrangeQuests: ReturnType<typeof vi.fn> };
  const sections = buildShoppingListView([at('Alpha', 'Pack A'), at('Beta', 'Pack B'), at('Gamma', 'Pack C')],
    {}, null, { filter: 'all' }).sections;
  const el = () => fixture.nativeElement as HTMLElement;
  const drop = (previousIndex: number, currentIndex: number) => ({ previousIndex, currentIndex }) as CdkDragDrop<unknown>;

  beforeEach(async () => {
    arranger = { arrangePacks: vi.fn(), arrangeQuests: vi.fn() };
    await TestBed.configureTestingModule({ imports: [ShoppingListArrangeNavComponent] }).compileComponents();
    fixture = TestBed.createComponent(ShoppingListArrangeNavComponent);
    fixture.componentRef.setInput('sections', sections);
    fixture.componentRef.setInput('arranger', arranger);
    fixture.detectChanges();
  });

  it('lists the packs, each striped in its colour', () => {
    const packs = Array.from(el().querySelectorAll<HTMLElement>('.shopping-arrange-nav-pack'));

    expect(packs.map(pack => pack.textContent?.trim())).toEqual(['Pack A', 'Pack B', 'Pack C']);
    expect(packs[0].style.getPropertyValue('--shopping-accent')).toBe(`var(--pack-accent-${sections[0].accent})`);
  });

  it('puts a dragged pack where it was dropped, and ignores a drop where it started', () => {
    fixture.componentInstance.drop(drop(2, 0));
    expect(arranger.arrangePacks).toHaveBeenCalledWith(['Pack C', 'Pack A', 'Pack B']);

    fixture.componentInstance.drop(drop(1, 1));
    expect(arranger.arrangePacks).toHaveBeenCalledTimes(1);
  });

  it('tracks the move as made in the sidebar', () => {
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);

    fixture.componentInstance.drop(drop(0, 1));

    expect(track).toHaveBeenCalledWith('arrange_shopping_route', { moved: 'pack', method: 'sidebar' });
  });
});
