import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainComponent } from './main/main.component';

const routes: Routes = [
  { path: '', redirectTo: '/main', pathMatch: 'full' },
  { path: 'main', component: MainComponent },
  // Legacy deep link: the affix builder used to be its own page. Keep the URL
  // working by rendering the main shell with the builder drawer opened.
  { path: 'affixes', component: MainComponent, data: { openAffixBuilder: true } }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, {})],
  exports: [RouterModule],
})
export class AppRoutingModule { }
