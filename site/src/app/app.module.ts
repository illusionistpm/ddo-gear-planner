import { GoalsLabelComponent } from './goals-label/goals-label.component';
import { BrowserModule } from '@angular/platform-browser';
import { NgModule, provideAppInitializer, inject, DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthModule, AuthHttpInterceptor } from '@auth0/auth0-angular';

import { GameDataService } from './gear/game-data.service';
import { GearDbService } from './gear/gear-db.service';
import { environment } from '../environments/environment';
import { authHttpInterceptorConfig } from './shared/auth-http-config';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { GearListComponent } from './gear-list/gear-list.component';
import { TypeaheadComponent } from './typeahead/typeahead.component';
import { GearDescriptionComponent } from './gear-description/gear-description.component';
import { EffectsTableComponent } from './effects-table/effects-table.component';
import { ItemsWithBonusTypeComponent } from './items-with-bonus-type/items-with-bonus-type.component';
import { FiltersComponent } from './filters/filters.component';
import { MainComponent } from './main/main.component';
import { PlannerToolbarComponent } from './planner-toolbar/planner-toolbar.component';
import { ItemSuggestionsComponent } from './item-suggestions/item-suggestions.component';
import { AffixPickerComponent } from './affix-picker/affix-picker.component';
import { ItemsInSetComponent } from './items-in-set/items-in-set.component';
import { ItemPreviewComponent } from './item-preview/item-preview.component';
import { BuildShareMenuComponent } from './build-share-menu/build-share-menu.component';
import { ExpandingCheckboxesComponent } from './expanding-checkboxes/expanding-checkboxes.component';
import { FilterItemTypeComponent } from './filter-item-type/filter-item-type.component';
import { UserItemLocationTooltipPipe } from './shared/user-item-location-tooltip.pipe';
import { AdminLinkComponent } from './admin-link.component';
import { SuggestionDrawerComponent } from './suggestion-drawer/suggestion-drawer.component';
import { AffixStartPromptComponent } from './affix-start-prompt/affix-start-prompt.component';
import { EquipmentSlotCardComponent } from './equipment-slot-card/equipment-slot-card.component';
import { ExternalAffixSlotCardComponent } from './external-affix-slot-card/external-affix-slot-card.component';
import { FiligreeSlotsComponent } from './filigree-slots/filigree-slots.component';
import { FiligreeSetDetailsComponent } from './filigree-set-details/filigree-set-details.component';
import { FiligreeSetDrawerComponent } from './filigree-set-details/filigree-set-drawer.component';
import { FiligreeSetPreviewComponent } from './filigree-set-preview/filigree-set-preview.component';
import { ExternalAffixFormComponent } from './external-affix-form/external-affix-form.component';
import { ExternalAffixValueComponent } from './external-affix-value/external-affix-value.component';
import { SlotIconComponent } from './slot-icon/slot-icon.component';
import { CreditsComponent } from './credits/credits.component';
import { SupportLinkComponent } from './support-link/support-link.component';
import { PageChromeComponent } from './page-chrome/page-chrome.component';
import { OwnListActionsComponent } from './shopping-list/own-list-actions.component';
import { MyListsMenuComponent } from './shopping-list/my-lists-menu.component';
import { SaveBuildDialogComponent } from './save-build-dialog/save-build-dialog.component';
import { MyBuildsComponent } from './my-builds/my-builds.component';
import { BuildActionsComponent } from './build-actions/build-actions.component';
import { ShrinkToFitDirective } from './shared/shrink-to-fit.directive';
import { AutofocusDirective } from './shared/autofocus.directive';
import { PanelSwipeDirective } from './main/panel-swipe.directive';
import { TapTooltipComponent } from './tap-tooltip/tap-tooltip.component';
import { CraftingOptionPickerComponent } from './crafting-option-picker/crafting-option-picker.component';
import { ShoppingListComponent } from './shopping-list/shopping-list.component';
import { ShoppingListShareMenuComponent } from './shopping-list/shopping-list-share-menu.component';
import { StillNeededPageComponent } from './still-needed-page/still-needed-page.component';
import { GroupRunPageComponent } from './group-run-page/group-run-page.component';
import { MenuBackdropComponent } from './menu-backdrop/menu-backdrop.component';
import { BuildChoicesComponent } from './shopping-list/build-choices.component';
import { ListDialogComponent } from './shopping-list/list-dialog.component';
import { ServerShoppingProgressStore } from './planner/shopping-list/server-shopping-progress-store';
import { ShoppingProgressStore } from './planner/shopping-list/shopping-progress-store';

@NgModule({
    declarations: [
        AppComponent,
        GoalsLabelComponent,
        GearListComponent,
        TypeaheadComponent,
        GearDescriptionComponent,
        CraftingOptionPickerComponent,
        TapTooltipComponent,
        EffectsTableComponent,
        ItemsWithBonusTypeComponent,
        FiltersComponent,
        MainComponent,
        PlannerToolbarComponent,
        ItemSuggestionsComponent,
        AffixPickerComponent,
        ItemsInSetComponent,
        ItemPreviewComponent,
        BuildShareMenuComponent,
        ExpandingCheckboxesComponent,
        FilterItemTypeComponent,
        UserItemLocationTooltipPipe,
        AdminLinkComponent,
        SuggestionDrawerComponent,
        AffixStartPromptComponent,
        EquipmentSlotCardComponent,
        ExternalAffixSlotCardComponent,
        FiligreeSlotsComponent,
        FiligreeSetDetailsComponent,
        FiligreeSetDrawerComponent,
        FiligreeSetPreviewComponent,
        ExternalAffixFormComponent,
        ExternalAffixValueComponent,
        SlotIconComponent,
        CreditsComponent,
        SupportLinkComponent,
        PageChromeComponent,
        OwnListActionsComponent,
        MyListsMenuComponent,
        SaveBuildDialogComponent,
        MyBuildsComponent,
        BuildActionsComponent,
        ShrinkToFitDirective,
        AutofocusDirective,
        PanelSwipeDirective,
        ShoppingListComponent,
        ShoppingListShareMenuComponent,
        GroupRunPageComponent,
        StillNeededPageComponent
    ],
    imports: [
        AppRoutingModule,
        NgbModule,
        BrowserModule,
        FormsModule,
        CdkScrollable,
        MenuBackdropComponent,
        ListDialogComponent,
        BuildChoicesComponent,
        AuthModule.forRoot({
            domain: environment.auth0Domain,
            clientId: environment.auth0ClientId,
            authorizationParams: {
                redirect_uri: typeof window !== 'undefined' ? window.location.origin : undefined,
                audience: environment.auth0Audience
            },
            // Without this, token renewal falls back to a hidden iframe
            // silently re-authenticating against Auth0's domain - which
            // modern browsers increasingly block via third-party cookie
            // restrictions. When that fails, the SDK falls back further to
            // a full-page redirect that lands back at the bare
            // redirect_uri above (no path, no query), losing whatever the
            // user was doing (e.g. mid-save). Refresh tokens renew via a
            // direct /oauth/token call instead, sidestepping the iframe
            // entirely.
            useRefreshTokens: true,
            // The default in-memory cache loses the refresh token on every
            // page reload - with nowhere persistent to read it back from,
            // the SDK falls back to the same hidden-iframe technique
            // useRefreshTokens above exists to avoid, and that fallback
            // fails the same way (third-party cookie blocking), leaving the
            // user silently signed out on refresh despite a valid session.
            // localstorage is Auth0's own documented pairing for
            // useRefreshTokens for exactly this reason. Trade-off: tokens
            // become readable by any JS running on the page, so this raises
            // the stakes of an XSS bug - acceptable here since this app has
            // no user-generated script/HTML rendering surface.
            cacheLocation: 'localstorage',
            // Which requests get a Bearer token - see its comment.
            httpInterceptor: authHttpInterceptorConfig
        })
    ],
    providers: [
        provideHttpClient(withInterceptorsFromDi()),
        // Saved builds' shopping-list progress syncs; the root default keeps
        // it in this browser only, which is what specs without AppModule get.
        { provide: ShoppingProgressStore, useExisting: ServerShoppingProgressStore },
        { provide: HTTP_INTERCEPTORS, useClass: AuthHttpInterceptor, multi: true },
        provideAppInitializer(() => {
            const injector = inject(Injector);
            // The load can outlive the injector - every TestBed that imports
            // AppModule tears down before it resolves - and injecting from a
            // destroyed injector throws NG0205.
            let destroyed = false;
            inject(DestroyRef).onDestroy(() => destroyed = true);
            return inject(GameDataService).load().then(() => {
                if (destroyed) {
                    return;
                }
                // GearDbService does a fair amount of synchronous work building its
                // gear/affix indexes in its constructor; instantiate it here so that
                // work happens during startup instead of stalling the first click on
                // an equipment slot.
                runInInjectionContext(injector, () => inject(GearDbService));
            });
        })
    ],
    bootstrap: [AppComponent]
})
export class AppModule { }
