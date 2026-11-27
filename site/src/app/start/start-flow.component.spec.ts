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
import { AffixDescriptionService } from '../affixes/affix-description.service';
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
    localStorage.removeItem('ddo-gear-planner-new-build-packs');
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
    localStorage.removeItem('ddo-gear-planner-new-build-packs');
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

  it('offers no "skip the start page" setting', () => {
    expect(el().querySelector('input[type="checkbox"]')).toBeNull();
  });

  it('walks a melee build through the steps with the URL held, then hands it to the planner', async () => {
    const router = TestBed.inject(Router);
    await click('.start-guided');
    expect(router.url).toBe('/start#role');

    await click('.start-role-melee');
    await click('.start-next');
    expect(router.url).toBe('/start#sources');
    await click('.start-next');
    expect(router.url).toBe('/start#weapons');
    await click('.start-link', 'only two-handed');
    // Two-handers leave the off hand empty: nothing to ask, and no offhand filter.
    expect(el().querySelector('.start-offhand-two-handed')).not.toBeNull();
    expect(el().querySelector('.start-offhand-any')).toBeNull();
    await click('.start-next');
    await click('.start-armor-docent');
    await click('.start-next');
    await click('.start-tactic', 'Stunning');
    await click('.start-next');
    await click('.start-trance-full');
    await click('.start-next');
    await click('.start-green-steel', 'Dust');

    expect(router.url).toBe('/start#extras');

    await click('.start-finish-now');

    expect(router.url.startsWith('/?b=')).toBe(true);
    const params = decodedUrl();
    expect(params['tracked']).toEqual(expect.arrayContaining(['Dodge', 'Melee Power', 'Strength', 'Stunning', 'Legendary Dust']));
    expect(params['hiddentypes']).toEqual(expect.stringContaining('Long Bows'));
    expect(params['hiddentypes']).toEqual(expect.stringContaining('Long Swords'));
    expect(params['hiddentypes']).toEqual(expect.stringContaining('Heavy armor'));
    expect(params['hiddentypes']).not.toEqual(expect.stringContaining('Great Swords'));
    expect(params['hiddentypes']).not.toEqual(expect.stringContaining('Docents'));
    expect(params['hiddentypes']).not.toEqual(expect.stringContaining('Tower shields'));
    const trance = TestBed.inject(EquippedService).getExternalAffixesSnapshot().filter(entry => entry.label === 'Trance');
    expect(trance.map(entry => `${entry.affixName} ${entry.bonusType} ${entry.kind}`)).toEqual([
      'Deadly Insight value', 'Accuracy Insight ignored', 'Stunning Insight ignored'
    ]);
    expect(TestBed.inject(NewBuildService).consumeHandOff()).toBe(true);
  });

  it('starts planning from the first step, on Basic and nothing else', async () => {
    await click('.start-guided');
    await click('.start-finish-now');

    const tracked = decodedUrl()['tracked'] as string[];
    expect(tracked).toContain('Dodge');
    expect(tracked).not.toContain('Melee Power');
    expect(decodedUrl()['hiddentypes']).toBeUndefined();
  });

  it('keeps one bright button, Next, in the footer\'s corner, and Start planning there on the summary', async () => {
    await click('.start-guided');
    await click('.start-role-ranged');
    const footer = () => el().querySelector('.start-footer')!;

    expect(Array.from(footer().querySelectorAll('.start-primary')).map(button => button.textContent?.trim())).toEqual(['Next']);
    expect(footer().querySelector('.start-plan')).toBeNull();

    await click('.start-progress-step', 'Summary');

    expect(Array.from(footer().querySelectorAll('.start-primary')).map(button => button.textContent?.trim())).toEqual(['Start planning']);
    expect(el().querySelector('.start-finish-now')).toBeNull();
    await click('.start-plan');
    expect(TestBed.inject(Router).url.startsWith('/?b=')).toBe(true);
  });

  it('offers a second weapon for two-weapon fighting: shields, orbs and rune arms go, weapons stay', async () => {
    await click('.start-guided');
    await click('.start-role-melee');
    await click('.start-progress-step', 'Weapons');
    await click('.start-offhand-weapon');
    await click('.start-finish-now');

    const hidden = String(decodedUrl()['hiddentypes']).split(',');
    expect(hidden).toEqual(expect.arrayContaining(['Tower shields', 'Orbs', 'Rune Arms']));
    expect(hidden).not.toContain('Long Swords');
    expect(hidden).not.toContain('Kukris');
  });

  it('lists exotic weapons in their own group, with no group of light ones', async () => {
    await click('.start-guided');
    await click('.start-role-melee');
    await click('.start-progress-step', 'Weapons');

    const groups = Array.from(el().querySelectorAll('.start-family-toggle')).map(toggle => toggle.textContent?.trim());
    expect(groups).toEqual(['One-handed', 'Two-handed', 'Exotic']);
  });

  it('starts levelling at 1-20', async () => {
    await click('.start-guided');
    await click('.start-chip', 'Levelling');

    const inputs = Array.from(el().querySelectorAll<HTMLInputElement>('.start-levels input'));
    expect(inputs.map(input => input.value)).toEqual(['1', '20']);
  });

  it('says what each Green Steel effect does', async () => {
    TestBed.inject(AffixDescriptionService).use({
      'Legendary Dust': { '*': 'Your attacks reduce enemy PRR. Then more.' },
      'Legendary Ooze': { '*': 'Your attacks summon oozes.(Note: which ooze varies.)' }
    });
    await click('.start-guided');
    await click('.start-role-melee');
    await click('.start-progress-step', 'Extras');

    const effects = Array.from(el().querySelectorAll('.start-green-steel-effect')).map(effect => effect.textContent?.trim());
    expect(effects).toEqual(['Your attacks reduce enemy PRR.', 'Your attacks summon oozes.']);
  });

  it('works the trance\'s Insight Deadly out from its ability score', async () => {
    await click('.start-guided');
    await click('.start-role-melee');
    await click('.start-progress-step', 'Trance');
    expect(el().querySelector('.start-trance-gives')?.textContent).toContain('+15');

    const input = el().querySelector<HTMLInputElement>('.start-trance-ability')!;
    input.value = '41';
    input.dispatchEvent(new Event('change'));
    await settle();

    expect(el().querySelector('.start-trance-gives')?.textContent).toContain('+7');
  });

  it('shows artifacts as the planner shows gear, and equips the one chosen', async () => {
    await click('.start-guided');
    await click('.start-role-melee');
    await click('.start-progress-step', 'Artifact');
    for (let i = 0; i < 50 && !el().querySelector('.start-artifact'); i++) {
      await new Promise(resolve => setTimeout(resolve, 20));
      await settle();
    }

    const first = el().querySelector('.start-artifact')!;
    expect(first.querySelector('app-gear-description')).not.toBeNull();
    const name = first.querySelector('.start-artifact-name')!.textContent!.trim();
    (first.querySelector('.start-artifact-use') as HTMLButtonElement).click();
    await settle();

    const equipped = TestBed.inject(EquippedService);
    expect(equipped.getSlotNames().some(slot => {
      let item: { name: string } | null = null;
      equipped.getSlot(slot)?.subscribe(value => item = value).unsubscribe();
      return (item as { name: string } | null)?.name === name;
    })).toBe(true);
  });

  it('skips a step without answering it, and offers a trance only to melee and ranged builds', async () => {
    await click('.start-guided');
    await click('.start-role-caster');
    await click('.start-progress-step', 'Offhand');
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

  describe('gear sources', () => {
    const packCheckbox = (name: string) => Array.from(el().querySelectorAll<HTMLLabelElement>('.pack-filter-option label'))
      .find(label => label.textContent?.trim().startsWith(name))!.previousElementSibling as HTMLInputElement;
    const tickedPacks = () => Array.from(el().querySelectorAll<HTMLInputElement>('.pack-filter-option input')).filter(box => box.checked).length;

    async function ownTwoPacks(): Promise<void> {
      await click('.start-packs-owned');
      // Untick everything, then tick two.
      for (const group of Array.from(el().querySelectorAll<HTMLInputElement>('.pack-group-title input'))) {
        if (group.checked || group.indeterminate) {
          group.click();
          await settle();
          if (group.checked) {
            group.click();
            await settle();
          }
        }
      }
      packCheckbox('Free Quests').click();
      await settle();
      packCheckbox('The Lost Gatekeepers').click();
      await settle();
    }

    it('hides raid items and the packs not owned in the build it hands over', async () => {
      await click('.start-guided');
      await click('.start-role-melee');
      await click('.start-next');
      expect(TestBed.inject(Router).url).toBe('/start#sources');

      await click('.start-show-raid');
      await ownTwoPacks();
      expect(tickedPacks()).toBe(2);
      await click('.start-finish-now');

      const params = decodedUrl();
      expect(params['raids']).toBe('false');
      expect(params['rare']).toBe('true');
      const hidden = String(params['hiddenpacks']).split(',');
      expect(hidden).toContain('Demon Sands');
      expect(hidden).not.toContain('The Lost Gatekeepers');
      expect(hidden).not.toContain('__NO_PACK__');
    });

    it('starts the next new build on the packs picked last time', async () => {
      await click('.start-guided');
      await click('.start-progress-step', 'Gear sources');
      await ownTwoPacks();

      // A new tab's setup: no answers, the remembered packs.
      sessionStorage.clear();
      await harness.navigateByUrl('/');
      await harness.navigateByUrl('/start#sources');
      await settle();

      expect(el().querySelector('.start-packs-owned')?.getAttribute('aria-checked')).toBe('true');
      expect(el().querySelector('.start-packs-remembered')).not.toBeNull();
      expect(tickedPacks()).toBe(2);

      await click('.start-packs-all');
      expect(TestBed.inject(NewBuildService).rememberedPacks()).toBeNull();
    });

    it('shows every pack, raids and rares again when the step is skipped', async () => {
      await click('.start-guided');
      await click('.start-progress-step', 'Gear sources');
      await click('.start-show-rare');
      await click('.start-packs-owned');

      await click('.start-skip');
      await click('.start-finish-now');

      const params = decodedUrl();
      expect(params['rare']).toBe('true');
      expect(params['hiddenpacks']).toBeUndefined();
    });

    it('warns on the Green Steel step that raid weapons are hidden', async () => {
      await click('.start-guided');
      await click('.start-role-melee');
      await click('.start-progress-step', 'Gear sources');
      await click('.start-show-raid');
      await click('.start-progress-step', 'Extras');

      expect(el().querySelector('.start-raids-hidden')).not.toBeNull();
    });
  });
});
