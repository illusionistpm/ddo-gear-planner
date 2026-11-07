import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterLink } from '@angular/router';

import { PageChromeComponent } from './page-chrome.component';

describe('PageChromeComponent', () => {
  async function render(url: string): Promise<HTMLAnchorElement> {
    await TestBed.configureTestingModule({
      declarations: [PageChromeComponent],
      imports: [RouterLink],
      // The support and credits buttons are theirs to test.
      schemas: [NO_ERRORS_SCHEMA],
      providers: [provideRouter([])]
    }).compileComponents();
    const fixture = TestBed.createComponent(PageChromeComponent);
    fixture.componentRef.setInput('backTo', { label: 'Planner', title: 'Back to the planner', url });
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>('a.page-chrome-back')!;
  }

  it('links back to a planner URL with its build query intact', async () => {
    const link = await render('/?b=z1.abc-_');

    expect(link.getAttribute('href')).toBe('/?b=z1.abc-_');
  });

  it('links back to a saved build\'s path', async () => {
    const link = await render('/build/s1/tank-build');

    expect(link.getAttribute('href')).toBe('/build/s1/tank-build');
  });
});
