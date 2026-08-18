import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { MainComponent } from './main.component';

describe('MainComponent', () => {
  let component: MainComponent;
  let fixture: ComponentFixture<MainComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(MainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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
});
