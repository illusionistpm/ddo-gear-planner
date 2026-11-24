import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { AffixDetails } from '../affixes/affix-ui.service';

/**
 * The body of an affix's or crafting option's details: what it does in DDO Wiki's words, then its
 * labelled lists (a compound's parts, what an option grants), then a link to the wiki. Shown in an
 * affix name's popover or tap panel (AffixNameComponent) and in the crafting picker.
 */
@Component({
    selector: 'app-affix-details',
    templateUrl: './affix-details.component.html',
    styleUrls: ['./affix-details.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    host: { style: 'display: block' }
})
export class AffixDetailsComponent {
  @Input({ required: true }) details!: AffixDetails;
  /** Name what's described: on in a popover or the picker, off under the row that already names it. */
  @Input() heading = false;

  get wikiUrl(): string {
    return 'https://ddowiki.com/index.php?search=' + encodeURIComponent(this.details.wikiName);
  }
}
