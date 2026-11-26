import { ApplicationRef, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';

import { BuildSummary } from '../build/build';
import { BuildUrlCodecService } from '../build/build-url-codec.service';
import { BuildsService } from '../build/builds.service';
import { EquippedService } from '../planner/equipped.service';
import { FiltersService } from '../planner/filters.service';
import { AuthService } from '../shared/auth.service';
import { StartFlowComponent } from './start-flow.component';
import { NewBuildService } from './new-build.service';

@Component({ template: 'planner', standalone: true })
class PlannerStubComponent { }

describe('StartFlowComponent', () => {
  let harness: RouterTestingHarness;
  let signedIn: BehaviorSubject<boolean>;
  let builds: BuildSummary[];
  const signIn = vi.fn();

  const el = () => harness.routeNativeElement as HTMLElement;
  const click = async (selector: string, text?: string) => {
    const target = Array.from(el().querySelectorAll<HTMLElement>(selector))
      .find(candidate => text === undefined || candidate.textContent?.trim().includes(text));
    expect(target, `${selector} ${text ?? ''}`).toBeTruthy();
    target!.click();
    await settle();
  };
  const settle = async () => {
    await TestBed.inject(ApplicationRef).whenStable();
    harness.detectChanges();
  };
  const decodedUrl = () => {
    const url = TestBed.inject(Router).parseUrl(TestBed.inject(Router).url);
    return TestBed.inject(BuildUrlCodecService).decode(url.queryParamMap.get('b')!)!;
  };

  beforeEach(async () => {
    sessionStorage.clear();
    localStorage.removeItem('ddo-gear-planner-open-planner-directly');
    signedIn = new BehaviorSubject(false);
    builds = [];
    signIn.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: '', component: PlannerStubComponent },
          { path: 'start', component: StartFlowComponent }
        ]),
        { provide: AuthService, useValue: { isLoading$: of(false), isAuthenticated$: signedIn, signIn } },
        { provide: BuildsService, useValue: { listMine: () => of(builds) } }
      ]
    });
    // The level range is set by the steps; the trance default reads gear at it.
    TestBed.inject(FiltersService);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/start');
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.removeItem('ddo-gear-planner-open-planner-directly');
  });

  it('asks a signed-out visitor to sign in, next to the ways to start', async () => {
    expect(el().querySelector('.start-sign-in')).not.toBeNull();
    expect(el().querySelector('.start-guided')).not.toBeNull();
    expect(el().querySelector('.start-blank')).not.toBeNull();

    await click('.start-sign-in');

    expect(signIn).toHaveBeenCalled();
  });

  it('lists a signed-in player\'s builds, most recently changed first, each opening the build', async () => {
    builds = [
      { id: '1', shortId: 'aaaa1111', name: 'Old tank', updatedAt: '2026-01-01T00:00:00Z' },
      { id: '2', shortId: 'bbbb2222', name: 'New caster', updatedAt: '2026-11-01T00:00:00Z' }
    ];
    signedIn.next(true);
    await settle();

    const links = Array.from(el().querySelectorAll<HTMLAnchorElement>('.start-build'));
    expect(links.map(link => link.querySelector('.start-build-name')?.textContent)).toEqual(['New caster', 'Old tank']);
    expect(links[0].getAttribute('href')).toBe('/build/bbbb2222/new-caster');
    expect(el().querySelector('.start-sign-in')).toBeNull();
  });

  it('remembers asking for the planner directly', async () => {
    await click('.start-prefers-planner input');

    expect(TestBed.inject(NewBuildService).prefersPlanner()).toBe(true);
  });

  it('walks a melee build through the steps with the URL held, then hands it to the planner', async () => {
    const router = TestBed.inject(Router);
    await click('.start-guided');
    expect(router.url).toBe('/start#role');

    await click('.start-role-melee');
    await click('.start-next');
    expect(router.url).toBe('/start#weapons');
    await click('.start-link', 'only two-handed');
    await click('.start-offhand-none');
    await click('.start-next');
    await click('.start-armor-docent');
    await click('.start-next');
    await click('.start-tactic', 'Stunning');
    await click('.start-next');
    await click('.start-trance-full');
    await click('.start-next');
    await click('.start-green-steel', 'Dust');

    expect(router.url).toBe('/start#extras');

    await click('.start-plan');

    expect(router.url.startsWith('/?b=')).toBe(true);
    const params = decodedUrl();
    expect(params['tracked']).toEqual(expect.arrayContaining(['Dodge', 'Melee Power', 'Strength', 'Stunning', 'Legendary Dust']));
    expect(params['hiddentypes']).toEqual(expect.stringContaining('Long Bows'));
    expect(params['hiddentypes']).toEqual(expect.stringContaining('Long Swords'));
    expect(params['hiddentypes']).toEqual(expect.stringContaining('Heavy armor'));
    expect(params['hiddentypes']).not.toEqual(expect.stringContaining('Great Swords'));
    expect(params['hiddentypes']).not.toEqual(expect.stringContaining('Docents'));
    const trance = TestBed.inject(EquippedService).getExternalAffixesSnapshot().filter(entry => entry.label === 'Trance');
    expect(trance.map(entry => `${entry.affixName} ${entry.bonusType} ${entry.kind}`)).toEqual([
      'Deadly Insight value', 'Accuracy Insight ignored', 'Stunning Insight ignored'
    ]);
    expect(TestBed.inject(NewBuildService).consumeHandOff()).toBe(true);
  });

  it('starts planning from the first step, on Basic and nothing else', async () => {
    await click('.start-guided');
    await click('.start-plan');

    const tracked = decodedUrl()['tracked'] as string[];
    expect(tracked).toContain('Dodge');
    expect(tracked).not.toContain('Melee Power');
    expect(decodedUrl()['hiddentypes']).toBeUndefined();
  });

  it('skips a step without answering it, and offers a trance only to melee and ranged builds', async () => {
    await click('.start-guided');
    await click('.start-role-caster');
    await click('.start-next');
    expect(el().textContent).toContain('What goes in your off hand?');
    expect(el().textContent).not.toContain('Which weapons?');

    await click('.start-skip');
    expect(TestBed.inject(Router).url).toBe('/start#armor');
    expect(Array.from(el().querySelectorAll('.start-progress-label')).map(label => label.textContent)).not.toContain('Trance');
  });

  it('brings the answers back after leaving the setup and returning', async () => {
    await click('.start-guided');
    await click('.start-role-ranged');
    await click('.start-next');

    await harness.navigateByUrl('/');
    await harness.navigateByUrl('/start#role');
    await settle();

    expect(el().querySelector('.start-role-ranged')?.getAttribute('aria-checked')).toBe('true');
    expect(TestBed.inject(EquippedService).getImportantAffixes().has('Ranged Power')).toBe(true);
  });
});
