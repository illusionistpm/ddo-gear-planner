import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { migrateLegacyUrlIfNeeded } from './app/build/legacy-url-migration';

if (environment.production) {
  enableProdMode();
}

// Must run before the Router exists - see legacy-url-migration.ts for why a
// component-level fix isn't safe here.
migrateLegacyUrlIfNeeded();

platformBrowser().bootstrapModule(AppModule, { applicationProviders: [provideZoneChangeDetection()], })
  .catch(err => console.error(err));
