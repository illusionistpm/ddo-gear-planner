import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { TrackedAffixSidebarComponent } from './tracked-affix-sidebar.component';

describe('TrackedAffixSidebarComponent', () => {
  let component: TrackedAffixSidebarComponent;
  let fixture: ComponentFixture<TrackedAffixSidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppModule]
    }).compileComponents();
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(TrackedAffixSidebarComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('tracks per-group collapse independently', () => {
    expect(component.isGroupCollapsed('Attributes')).toBe(false);
    component.toggleGroup('Attributes');
    expect(component.isGroupCollapsed('Attributes')).toBe(true);
    expect(component.isGroupCollapsed('Defense')).toBe(false);
  });
});
