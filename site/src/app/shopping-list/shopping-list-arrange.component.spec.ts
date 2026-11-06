import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { GroupCharacter } from '../planner/shopping-list/group-run.service';
import { buildGroupListView } from '../planner/shopping-list/group-shopping-list';
import { ShoppingListService } from '../planner/shopping-list/shopping-list.service';
import type { ShoppingEntry, ShoppingSource } from '../planner/shopping-list/shopping-list-types';
import { buildShoppingListView, UNKNOWN_SOURCE_LABEL } from '../planner/shopping-list/shopping-list-view-model';
import { AnalyticsService } from '../shared/analytics.service';
import { ShoppingListArrangeComponent } from './shopping-list-arrange.component';

function at(quest: string | null, pack: string | null): ShoppingEntry {
  const sources: ShoppingSource[] = quest ? [{ quest, pack, raid: false, wikiUrl: `wiki/${quest}` }] : [];
  const name = quest ?? 'Lost';
  return {
    key: `g|${name}`, kind: 'gear', identity: `gear|${name}`, label: name, system: null, ml: 0, sources, sourceInherited: false,
    rare: false, artifact: false, wikiUrl: null, troveName: null, parentKey: null, details: [],
  };
}

describe('ShoppingListArrangeComponent', () => {
  let fixture: ComponentFixture<ShoppingListArrangeComponent>;
  let service: { arrangePacks: ReturnType<typeof vi.fn>; arrangeQuests: ReturnType<typeof vi.fn> };
  const sections = buildShoppingListView([at('Alpha', 'Pack A'), at('Beta', 'Pack A'), at('Gamma', 'Pack B'), at(null, null)],
    {}, null, { filter: 'all' }).sections;

  const el = () => fixture.nativeElement as HTMLElement;
  const pack = (index: number) => el().querySelectorAll<HTMLElement>('.shopping-arrange-pack')[index];
  const button = (row: Element, which: 'up' | 'down') => row.querySelector<HTMLButtonElement>(`:scope > .shopping-arrange-row .shopping-arrange-${which}`)!;
  const quest = (packIndex: number, index: number) => pack(packIndex).querySelectorAll('.shopping-arrange-quest')[index];

  beforeEach(async () => {
    service = { arrangePacks: vi.fn(), arrangeQuests: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [ShoppingListArrangeComponent],
      providers: [{ provide: ShoppingListService, useValue: service }]
    }).compileComponents();
    fixture = TestBed.createComponent(ShoppingListArrangeComponent);
    fixture.componentRef.setInput('sections', sections);
    fixture.detectChanges();
  });

  it('outlines each pack with its quests, an unknown source last with nothing to move it by', () => {
    const outline = Array.from(el().querySelectorAll('.shopping-arrange-pack'), packElement => [
      packElement.querySelector('.shopping-arrange-pack-row .shopping-arrange-name')?.textContent?.trim(),
      Array.from(packElement.querySelectorAll('.shopping-arrange-quest .shopping-arrange-name'), name => name.textContent?.trim()),
    ]);
    expect(outline).toEqual([['Pack A', ['Alpha', 'Beta']], ['Pack B', ['Gamma']], ['Other sources', [UNKNOWN_SOURCE_LABEL]]]);

    const unknown = quest(2, 0);
    expect(unknown.querySelector('.shopping-arrange-handle')).toBeNull();
    expect(unknown.querySelector('button')).toBeNull();
  });

  it('lists what is got at each quest under it, the unknown source\'s too', () => {
    const things = (packIndex: number, index: number) =>
      Array.from(quest(packIndex, index).querySelectorAll('.shopping-arrange-thing'), thing => thing.textContent?.trim());

    expect(things(0, 0)).toEqual(['Alpha']);
    expect(things(1, 0)).toEqual(['Gamma']);
    expect(things(2, 0)).toEqual(['Lost']);
    // Only a group's list of several characters says whose each thing is.
    expect(el().querySelector('.shopping-arrange-dots')).toBeNull();
  });

  it('on a group\'s list, dots each thing with the characters it is for, and strikes what is got', () => {
    const ring = at('Alpha', 'Pack A');
    const sword = { ...at('Beta', 'Pack A'), key: 'g|Sword', identity: 'gear|Sword', label: 'Sword', sources: ring.sources };
    const view = buildGroupListView([
      { buildId: 'b-kira', characterName: 'Kira', entries: [ring, sword], needed: [ring.key, sword.key] },
      { buildId: 'b-vex', characterName: 'Vex', entries: [ring], needed: [] },
    ], { filter: 'all', picks: {}, order: null });
    const character = (buildId: string, characterName: string, accent: number) =>
      ({ buildId, characterName, accent, mine: false, needed: 0, total: 0, buildName: '', unreadable: false }) satisfies GroupCharacter;
    fixture.componentRef.setInput('sections', view.sections);
    fixture.componentRef.setInput('characters', new Map([['b-kira', character('b-kira', 'Kira', 0)], ['b-vex', character('b-vex', 'Vex', 3)]]));
    fixture.detectChanges();

    const [ringThing, swordThing] = Array.from(el().querySelectorAll<HTMLElement>('.shopping-arrange-thing'));
    expect(ringThing.querySelector('.shopping-arrange-dots')?.getAttribute('aria-label')).toBe('For Kira, Vex');
    expect(Array.from(ringThing.querySelectorAll<HTMLElement>('.shopping-arrange-dot'), dot => dot.style.getPropertyValue('--shopping-member')))
      .toEqual(['var(--member-accent-0)', 'var(--member-accent-3)']);
    expect(ringThing.classList).not.toContain('got');
    expect(swordThing.querySelector('.shopping-arrange-dots')?.getAttribute('aria-label')).toBe('For Kira');

    fixture.componentRef.setInput('sections', buildGroupListView([
      { buildId: 'b-kira', characterName: 'Kira', entries: [ring, sword], needed: [sword.key] },
      { buildId: 'b-vex', characterName: 'Vex', entries: [ring], needed: [] },
    ], { filter: 'all', picks: {}, order: null }).sections);
    fixture.detectChanges();
    expect(el().querySelector('.shopping-arrange-thing')?.classList).toContain('got');
  });

  it('moves a pack a step with its arrows, which stop at the ends', () => {
    expect(button(pack(0), 'up').disabled).toBe(true);
    expect(button(pack(2), 'down').disabled).toBe(true);
    expect(button(pack(0), 'down').getAttribute('aria-label')).toBe('Move Pack A down');

    button(pack(0), 'down').click();
    expect(service.arrangePacks).toHaveBeenLastCalledWith(['Pack B', 'Pack A', '']);

    button(pack(2), 'up').click();
    expect(service.arrangePacks).toHaveBeenLastCalledWith(['Pack A', '', 'Pack B']);
  });

  it('moves a quest a step within its pack', () => {
    expect(button(quest(0, 0), 'up').disabled).toBe(true);

    button(quest(0, 0), 'down').click();

    expect(service.arrangeQuests).toHaveBeenCalledWith(['Beta', 'Alpha']);
    expect(service.arrangePacks).not.toHaveBeenCalled();
  });

  it('puts a dragged pack or quest where it was dropped, and ignores a drop where it started', () => {
    const drop = (previousIndex: number, currentIndex: number) => ({ previousIndex, currentIndex }) as CdkDragDrop<unknown>;
    const component = fixture.componentInstance;

    component.dropPack(drop(2, 0));
    expect(service.arrangePacks).toHaveBeenCalledWith(['', 'Pack A', 'Pack B']);

    component.dropQuest(sections[0], drop(1, 0));
    expect(service.arrangeQuests).toHaveBeenCalledWith(['Beta', 'Alpha']);

    component.dropPack(drop(1, 1));
    expect(service.arrangePacks).toHaveBeenCalledTimes(1);
  });

  it('tracks each move, and how it was made', () => {
    const track = vi.spyOn(TestBed.inject(AnalyticsService), 'track').mockReturnValue(undefined);

    button(pack(0), 'down').click();
    fixture.componentInstance.dropQuest(sections[0], { previousIndex: 0, currentIndex: 1 } as CdkDragDrop<unknown>);

    expect(track.mock.calls).toEqual([
      ['arrange_shopping_route', { moved: 'pack', method: 'button' }],
      ['arrange_shopping_route', { moved: 'quest', method: 'drag' }],
    ]);
  });
});
