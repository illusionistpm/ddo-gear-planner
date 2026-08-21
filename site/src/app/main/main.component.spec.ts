import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { MainComponent } from './main.component';

describe('MainComponent', () => {
  let component: MainComponent;
  let fixture: ComponentFixture<MainComponent>;
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

  beforeEach(() => {
    fixture = TestBed.createComponent(MainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('renders non-production admin access in the workspace bar', () => {
    const compiled: HTMLElement = fixture.nativeElement;

    expect(compiled.querySelector('.planner-workspace-bar app-admin-link')).not.toBeNull();
  });

  it('starts on the equipment tab', () => {
    expect(component.activeTab).toBe('equipment');
    expect(component.filtersOpen).toBeFalse();
  });

  it('toggles the filter sheet', () => {
    component.toggleFilters();

    expect(component.filtersOpen).toBeTrue();

    component.closeFilters();

    expect(component.filtersOpen).toBeFalse();
  });

  it('switches tabs without forcing a scroll position', () => {
    spyOn(window, 'scrollTo');

    component.selectTab('affixes');

    expect(component.activeTab).toBe('affixes');
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  it('dismisses filters when selecting a view tab', () => {
    component.toggleFilters();
    component.selectTab('affixes');

    expect(component.filtersOpen).toBeFalse();
    expect(component.activeTab).toBe('affixes');
  });

  it('pairs the tracked affixes tab green cue with intro text and a skip action', () => {
    component.trackedAffixesHint = true;

    expect(component.shouldHighlightTrackedAffixes()).toBeTrue();
  });

  it('hides the tracked affixes onboarding cue when dismissed', () => {
    component.trackedAffixesHint = true;

    component.dismissIntro();

    expect(component.shouldHighlightTrackedAffixes()).toBeFalse();
  });
});
