import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { of } from 'rxjs';

import { AppModule } from '../app.module';
import { EquippedService, VisibleSetBonus } from '../equipped.service';
import { GearListComponent } from './gear-list.component';

describe('GearListComponent', () => {
  let component: GearListComponent;
  let fixture: ComponentFixture<GearListComponent>;
  const onboardingStateKey = 'ddo-planner-onboarding-state-v1';
  const legacyOnboardingKey = 'ddo-planner-onboarding-affix-type-opened';

  beforeEach(waitForAsync(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

  afterEach(() => {
    localStorage.removeItem(onboardingStateKey);
    localStorage.removeItem(legacyOnboardingKey);
  });

  function createComponentWithSetBonuses(setBonuses: Array<VisibleSetBonus>) {
    const equipped = TestBed.inject(EquippedService);
    spyOn(equipped, 'getVisibleSetBonusesObservable').and.returnValue(of(setBonuses));

    fixture = TestBed.createComponent(GearListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('should create', () => {
    createComponentWithSetBonuses([]);

    expect(component).toBeTruthy();
  });

  it('does not show the equipment/set divider when no sets are equipped', () => {
    createComponentWithSetBonuses([]);

    expect(fixture.nativeElement.querySelector('.equipment-set-divider')).toBeNull();
  });

  it('shows the equipment/set divider when sets are equipped', () => {
    createComponentWithSetBonuses([{
      setName: 'Test Set',
      pieces: 2,
      tiers: []
    }]);

    expect(fixture.nativeElement.querySelector('.equipment-set-divider')).not.toBeNull();
  });

  it('pairs the armor green cue with intro text and a skip action', () => {
    createComponentWithSetBonuses([]);
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('.equipment-onboarding-hint')).not.toBeNull();
    expect(compiled.querySelector('.recommended-start-slot')).not.toBeNull();
    expect(compiled.textContent).toContain('Pick an armor item first');
    expect(compiled.querySelector('.onboarding-dismiss-button')?.textContent).toContain('Skip intro');
  });

  it('hides the armor onboarding cue when dismissed', () => {
    createComponentWithSetBonuses([]);

    component.dismissIntro();

    expect(component.shouldShowArmorStartHint()).toBeFalse();
  });
});
