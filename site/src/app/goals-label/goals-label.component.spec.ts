import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AppModule } from '../app.module';
import { GoalsLabelComponent } from './goals-label.component';

describe('GoalsLabelComponent', () => {
  let fixture: ComponentFixture<GoalsLabelComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AppModule] }).compileComponents();
    fixture = TestBed.createComponent(GoalsLabelComponent);
  });

  const el = () => fixture.nativeElement as HTMLElement;

  it('names the view tab: Build Goals, Goals when short', () => {
    fixture.detectChanges();

    expect(el().querySelector('.goals-label-full')?.textContent).toBe('Build Goals');
    expect(el().querySelector('.goals-label-short')?.textContent).toBe('Goals');
  });
});
