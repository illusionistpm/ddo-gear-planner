import { BrowserModule } from '@angular/platform-browser';
import { NgModule, provideAppInitializer, inject, DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { FormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthModule, AuthHttpInterceptor } from '@auth0/auth0-angular';

import { GameDataService } from './gear/game-data.service';
import { GearDbService } from './gear/gear-db.service';
import { environment } from '../environments/environment';

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
import { AffixBuilderDrawerComponent } from './affix-builder-drawer/affix-builder-drawer.component';
import { TrackedEquipmentSidebarComponent } from './tracked-equipment-sidebar/tracked-equipment-sidebar.component';
import { TrackedAffixSidebarComponent } from './tracked-affix-sidebar/tracked-affix-sidebar.component';
import { EquipmentSlotCardComponent } from './equipment-slot-card/equipment-slot-card.component';
import { ExternalAffixSlotCardComponent } from './external-affix-slot-card/external-affix-slot-card.component';
import { ExternalAffixFormComponent } from './external-affix-form/external-affix-form.component';
import { ExternalAffixValueComponent } from './external-affix-value/external-affix-value.component';
import { SaveBuildDialogComponent } from './save-build-dialog/save-build-dialog.component';
import { MyBuildsComponent } from './my-builds/my-builds.component';
import { BuildActionsComponent } from './build-actions/build-actions.component';
import { ShrinkToFitDirective } from './shared/shrink-to-fit.directive';
import { AutofocusDirective } from './shared/autofocus.directive';

@NgModule({
    declarations: [
        AppComponent,
        GearListComponent,
        TypeaheadComponent,
        GearDescriptionComponent,
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
        AffixBuilderDrawerComponent,
        TrackedEquipmentSidebarComponent,
        TrackedAffixSidebarComponent,
        EquipmentSlotCardComponent,
        ExternalAffixSlotCardComponent,
        ExternalAffixFormComponent,
        ExternalAffixValueComponent,
        SaveBuildDialogComponent,
        MyBuildsComponent,
        BuildActionsComponent,
        ShrinkToFitDirective,
        AutofocusDirective
    ],
    imports: [
        AppRoutingModule,
        NgbModule,
        BrowserModule,
        FormsModule,
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
            // Lets BuildsService stay auth-agnostic: any request whose URL
            // matches gets an Authorization: Bearer header attached
            // automatically by AuthHttpInterceptor below.
            //
            // GET /api/build/:shortId (singular - the public shared-link
            // fetch) needs its own entry with allowAnonymous: true. Without
            // it, a signed-out visitor opening a shared build link fails
            // silently: the interceptor tries to attach a token anyway
            // (because the URL still matches an allowedList entry), that
            // token fetch throws login_required since there's no session,
            // and the interceptor - by default - turns that into an error
            // on the whole HTTP request rather than letting it through
            // unauthenticated. MainComponent's error handler for that
            // request then redirects to '/', which looks like the build URL
            // "blanks itself" for a signed-out viewer even though the build
            // still exists.
            httpInterceptor: {
                allowedList: [
                    { uri: `${environment.apiBaseUrl}/api/build/*`, allowAnonymous: true },
                    `${environment.apiBaseUrl}/api/*`
                ]
            }
        })
    ],
    providers: [
        provideHttpClient(withInterceptorsFromDi()),
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
