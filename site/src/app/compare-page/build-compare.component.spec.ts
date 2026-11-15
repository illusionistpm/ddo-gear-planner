import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { BuildsService } from '../build/builds.service';
import { GearDbService } from '../gear/gear-db.service';
import { Item } from '../gear/item';
import { AuthService } from '../shared/auth.service';
import { BuildCompareComponent } from './build-compare.component';

/** Two rings with the same affix of the same bonus type at different values, and nothing crafted. */
function ringsDifferingIn(gearDb: GearDbService): { weak: Item; strong: Item; affix: string; weakValue: number; strongValue: number } {
  const rings = gearDb.getGearBySlot('Ring1').filter(ring => !ring.crafting?.length && !ring.getSets().length && !ring.artifact);
  for (const weak of rings) {
    for (const affix of weak.affixes) {
      const strong = rings.find(other => other !== weak && other.affixes.some(candidate => candidate.name === affix.name
        && candidate.type === affix.type && candidate.value > affix.value)
        && weak.affixes.filter(mine => mine.name === affix.name).length === 1
        && other.affixes.filter(theirs => theirs.name === affix.name).length === 1);
      if (strong && typeof affix.value === 'number' && affix.value > 0 && affix.type !== 'Penalty' && affix.type !== 'Bool') {
        const strongValue = strong.affixes.find(candidate => candidate.name === affix.name)!.value;
        return { weak, strong, affix: affix.name, weakValue: affix.value, strongValue };
      }
    }
  }
  throw new Error('No two rings differ in one affix');
}

describe('BuildCompareComponent', () => {
  let fixture: ComponentFixture<BuildCompareComponent>;
  let signedIn: BehaviorSubject<boolean>;
  let signIn: ReturnType<typeof vi.fn>;
  let saved: Record<string, { name: string; blob: string }>;
  let navigate: ReturnType<typeof vi.spyOn>;
  let rings: ReturnType<typeof ringsDifferingIn>;

  const el = () => fixture.nativeElement as HTMLElement;
  const text = () => el().textContent!.replace(/\s+/g, ' ');
  const button = (label: string) => Array.from(el().querySelectorAll<HTMLButtonElement>('button'))
    .find(candidate => (candidate.getAttribute('aria-label') ?? candidate.textContent?.replace(/\s+/g, ' ').trim()) === label);
  const row = (name: string) => Array.from(el().querySelectorAll<HTMLElement>('.compare-row'))
    .find(candidate => candidate.querySelector('.compare-name')?.textContent?.trim().startsWith(name));
  const cells = (name: string) => Array.from(row(name)!.querySelectorAll('.compare-row-summary .num')).map(cell => cell.textContent!.trim());

  async function create(a: string | null, b: string | null, { signedInAtStart = true } = {}): Promise<void> {
    signedIn = new BehaviorSubject(signedInAtStart);
    signIn = vi.fn();
    await TestBed.configureTestingModule({
      imports: [BuildCompareComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated$: signedIn, signIn } },
        { provide: BuildsService, useValue: {
          listMine: () => of(Object.entries(saved).map(([shortId, build], index) =>
            ({ id: `id${index}`, shortId, name: build.name }))),
          getByShortId: (shortId: string) => saved[shortId]
            ? of(saved[shortId])
            : throwError(() => new HttpErrorResponse({ status: 404 })),
        } },
      ]
    }).compileComponents();
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(BuildCompareComponent);
    fixture.componentRef.setInput('a', a);
    fixture.componentRef.setInput('b', b);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    const codec = TestBed.inject(BuildUrlCodecService);
    rings = ringsDifferingIn(TestBed.inject(GearDbService));
    saved = {
      old1: { name: 'Old rings', blob: codec.encode({ Ring1: rings.weak.name, tracked: [rings.affix, 'Fortification'] }) },
      new1: { name: 'New rings', blob: codec.encode({ Ring1: rings.strong.name, tracked: [rings.affix] }) },
    };
    TestBed.resetTestingModule();
  });

  it('shows each tracked affix in both builds, with the change', async () => {
    await create('old1', 'new1');

    const change = rings.strongValue - rings.weakValue;
    expect(cells(rings.affix)).toEqual([String(rings.weakValue), String(rings.strongValue), `+${change}`]);
    expect(text()).toContain('1 higher');
    expect(text()).toContain('0 lower');
    expect(el().querySelectorAll('select').length).toBe(2);
    expect(Array.from(el().querySelectorAll('select')).map(select => select.selectedOptions[0].textContent!.trim()))
      .toEqual(['Old rings', 'New rings']);
    expect(text()).toContain(`${rings.weak.name}`);
    expect(text()).toContain(`${rings.strong.name}`);
  });

  it('hides unchanged affixes until Changes only is turned off', async () => {
    await create('old1', 'new1');
    expect(row('Fortification')).toBeUndefined();

    const toggle = el().querySelector<HTMLInputElement>('.compare-toggle input')!;
    expect(toggle.checked).toBe(true);
    toggle.click();
    fixture.detectChanges();

    expect(cells('Fortification')).toEqual(['0', '0', '—']);
    expect(row('Fortification')!.textContent).toContain('tracked in Before');
  });

  it('breaks a row down by bonus type, in bold where a side\'s source differs, with the change', async () => {
    await create('old1', 'new1');

    const lines = Array.from(row(rings.affix)!.querySelectorAll('.compare-breakdown-row:not(.compare-breakdown-head)'));
    const line = lines.find(candidate => candidate.textContent!.includes(rings.weak.name))!;
    const sources = Array.from(line.querySelectorAll<HTMLElement>('.compare-source'))
      .map(source => [source.textContent!.trim(), source.title, source.classList.contains('changed')]);

    expect(sources).toEqual([[rings.weak.name, 'Ring 1', true], [rings.strong.name, 'Ring 1', true]]);
    expect(line.querySelector('.compare-delta')!.textContent!.trim()).toBe(`+${rings.strongValue - rings.weakValue}`);
  });

  it('shows an on/off affix as the planner\'s checkboxes, under Checklist', async () => {
    TestBed.configureTestingModule({});
    const gearDb = TestBed.inject(GearDbService);
    const vorpal = gearDb.getGearBySlot('Weapon').find(weapon => weapon.affixes.some(affix => affix.name === 'Vorpal'))!;
    const codec = TestBed.inject(BuildUrlCodecService);
    saved['sharp1'] = { name: 'Sharp', blob: codec.encode({ Weapon: vorpal.name, tracked: ['Vorpal'] }) };
    saved['blunt1'] = { name: 'Blunt', blob: codec.encode({ tracked: ['Vorpal'] }) };
    TestBed.resetTestingModule();
    await create('sharp1', 'blunt1');

    const [before, after, change] = Array.from(row('Vorpal')!.querySelectorAll('.compare-row-summary .num'));
    expect(before.querySelector('.fa-square-check')).not.toBeNull();
    expect(after.querySelector('.fa-square')).not.toBeNull();
    expect(change.textContent!.trim()).toBe('Lost');
    expect(row('Vorpal')!.querySelector('.compare-breakdown-type')!.textContent!.trim()).toBe('Checklist');
  });

  it('says so when a build is missing, and still shows the other', async () => {
    await create('old1', 'gone1');

    expect(text()).toContain('No saved build with this link');
    expect(el().querySelectorAll('select')[0].selectedOptions[0].textContent!.trim()).toBe('Old rings');
    expect(el().querySelector('.compare-row')).toBeNull();
  });

  it('says so when a build can\'t be read', async () => {
    saved['bad1'] = { name: 'Ancient', blob: 'not a build' };
    await create('old1', 'bad1');

    expect(text()).toContain('saved in a format this page can no longer read');
  });

  it('asks to sign in to pick builds, still showing the ones the link names', async () => {
    await create('old1', 'new1', { signedInAtStart: false });

    expect(el().querySelector('select')).toBeNull();
    expect(Array.from(el().querySelectorAll('.compare-picked')).map(picked => picked.textContent!.trim()))
      .toEqual(['Old rings', 'New rings']);
    expect(row(rings.affix)).toBeDefined();

    button('Sign in to pick from your builds')!.click();
    expect(signIn).toHaveBeenCalled();
  });

  it('swaps the two builds, and picks another', async () => {
    await create('old1', 'new1');

    button('Swap Before and After')!.click();
    expect(navigate).toHaveBeenCalledWith('/compare/new1/old1', { replaceUrl: true });

    const after = el().querySelectorAll('select')[1];
    after.value = 'old1';
    after.dispatchEvent(new Event('change'));
    expect(navigate).toHaveBeenCalledWith('/compare/old1/old1');
  });

  it('asks for the other build when the link names only one', async () => {
    await create('old1', null);

    expect(text()).toContain('Pick two builds');
    expect(el().querySelectorAll('select')[1].selectedOptions[0].textContent!.trim()).toBe('Pick a build…');
  });
});
