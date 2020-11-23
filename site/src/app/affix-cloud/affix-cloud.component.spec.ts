import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { AffixCloudComponent } from './affix-cloud.component';

describe('AffixCloudComponent', () => {
  let component: AffixCloudComponent;
  let fixture: ComponentFixture<AffixCloudComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [ AffixCloudComponent ]
    })
    .compileComponents();
  }));

  beforeEach(() => {
    fixture = TestBed.createComponent(AffixCloudComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
