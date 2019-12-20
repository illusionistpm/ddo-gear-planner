import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { AppComponent } from './app.component';
import { GearListComponent } from './gear-list/gear-list.component';
import { GearComponent } from './gear/gear.component';

@NgModule({
  declarations: [
    AppComponent,
    GearListComponent,
    GearComponent
  ],
  imports: [
    BrowserModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
