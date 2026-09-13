import '@angular/compiler';
import { enableProdMode, provideZoneChangeDetection } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { environment } from './environments/environment';
import { migrateLegacyUrlIfNeeded } from './app/legacy-url-migration';

if (environment.production) {
  enableProdMode();
}

// Must run before the Router exists - see legacy-url-migration.ts for why a
// component-level fix isn't safe here.
migrateLegacyUrlIfNeeded();

platformBrowserDynamic().bootstrapModule(AppModule, { applicationProviders: [provideZoneChangeDetection()], })
  .catch(err => console.error(err));
