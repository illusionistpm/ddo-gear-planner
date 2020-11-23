import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainComponent } from './main/main.component';
import { AffixCloudComponent } from './affix-cloud/affix-cloud.component';

const routes: Routes = [
  { path: '', redirectTo: '/affixes', pathMatch: 'full' },
  { path: 'affixes', component: AffixCloudComponent },
  { path: 'main', component: MainComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { relativeLinkResolution: 'legacy' })],
  exports: [RouterModule],
})
export class AppRoutingModule { }
