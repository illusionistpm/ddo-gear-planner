import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';
import { HashLocationStrategy, LocationStrategy  } from '@angular/common';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { GearListComponent } from './gear-list/gear-list.component';
import { GearComponent } from './gear/gear.component';
import { TypeaheadComponent } from './typeahead/typeahead.component';
import { GearDescriptionComponent } from './gear-description/gear-description.component';
import { EffectsTableComponent } from './effects-table/effects-table.component';
import { ItemsWithBonusTypeComponent } from './items-with-bonus-type/items-with-bonus-type.component';
import { LevelRangeComponent } from './level-range/level-range.component';
import { MainComponent } from './main/main.component';
import { ItemSuggestionsComponent } from './item-suggestions/item-suggestions.component';
import { AffixCloudComponent } from './affix-cloud/affix-cloud.component';

@NgModule({
  declarations: [
    AppComponent,
    GearListComponent,
    GearComponent,
    TypeaheadComponent,
    GearDescriptionComponent,
    EffectsTableComponent,
    ItemsWithBonusTypeComponent,
    LevelRangeComponent,
    MainComponent,
    ItemSuggestionsComponent,
    AffixCloudComponent
  ],
  imports: [
    AppRoutingModule,
    NgbModule,
    BrowserModule,
    FormsModule
  ],
  providers: [
    {provide : LocationStrategy , useClass: HashLocationStrategy}
  ],
  bootstrap: [AppComponent],
  entryComponents: [ItemsWithBonusTypeComponent, ItemSuggestionsComponent]
})
export class AppModule { }
