import { async, ComponentFixture, TestBed } from '@angular/core/testing';

import { AffixCloudComponent } from './affix-cloud.component';

describe('AffixCloudComponent', () => {
  let component: AffixCloudComponent;
  let fixture: ComponentFixture<AffixCloudComponent>;

  beforeEach(async(() => {
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
