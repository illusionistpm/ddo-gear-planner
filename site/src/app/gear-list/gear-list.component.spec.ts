import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { of } from 'rxjs';

import { AppModule } from '../app.module';
import { EquippedService, VisibleSetBonus } from '../equipped.service';
import { GearListComponent } from './gear-list.component';

describe('GearListComponent', () => {
  let component: GearListComponent;
  let fixture: ComponentFixture<GearListComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ AppModule ]
    })
    .compileComponents();
  }));

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
});
