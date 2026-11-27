import { ChangeDetectionStrategy, Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';

import { AffixPackagesService, DEFAULT_PACKAGE } from '../affixes/affix-packages.service';
import { AffixEditorService } from '../planner/affix-editor.service';
import { EquippedService } from '../planner/equipped.service';
import { startNewBuild } from '../start/start-new-build';

/**
 * One line over the equipment while a build has no focus yet: a fresh build
 * opens on the Affixes view, where the editor asks for one, but anyone who
 * heads to the gear first gets pointed back. Only on the tabbed layout - side
 * by side the editor is already on screen (see the host's CSS).
 */
@Component({
  selector: 'app-affix-start-prompt',
  templateUrl: './affix-start-prompt.component.html',
  styleUrls: ['./affix-start-prompt.component.css'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AffixStartPromptComponent implements OnInit, OnDestroy {
  defaultSelected = false;

  private subscription?: Subscription;

  constructor(
    private editor: AffixEditorService,
    private affixPackages: AffixPackagesService,
    private equipped: EquippedService,
    private router: Router
  ) { }

  ngOnInit() {
    this.subscription = this.equipped.getImportantAffixesObservable().subscribe(tracked => {
      this.defaultSelected = this.affixPackages.isSelected(this.affixPackages.packages.get(DEFAULT_PACKAGE), tracked);
    });
  }

  ngOnDestroy() {
    this.subscription?.unsubscribe();
  }

  startGuided() {
    void startNewBuild(this.router);
  }

  chooseAffixes() {
    this.editor.reveal('start_banner');
  }
}
