import { ChangeDetectorRef, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

type ValueMode = 'same_as_affix_number' | 'fixed' | 'boolean_one';
type ReviewStatus = 'unreviewed' | 'accepted' | 'tweaked' | 'needs-tweak' | 'rejected';

interface CompoundAffixComponent {
  name: string;
  type: string;
  value: { mode: ValueMode; amount?: number };
}

interface CompoundAffixDefinition {
  components: CompoundAffixComponent[];
  notes?: string;
}

interface ReviewEntry {
  name: string;
  status: ReviewStatus;
  reviewNotes: string;
  reviewedAt?: string;
  suggestion?: CompoundAffixDefinition;
  reviewedDefinition?: CompoundAffixDefinition;
  candidate?: any;
  candidatePresent?: boolean;
  nameMatchesCurrentAffix?: boolean;
  suggestedCanonicalName?: string;
  staleReason?: string;
  llmResult?: any;
  exampleTooltip?: string;
  impact: Array<{
    itemName: string;
    itemUrl: string;
    before: any[];
    after: any[];
  }>;
}

interface ReviewPayload {
  allowedBonusTypes: string[];
  knownAffixNames: string[];
  entries: ReviewEntry[];
}

const API_ROOT = 'http://127.0.0.1:8765';
const SELECTED_AFFIX_STORAGE_KEY = 'ddo-admin-selected-affix';

function requestJson<T>(url: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(options.method || 'GET', url);
    request.setRequestHeader('Accept', 'application/json');
    if (options.body !== undefined) {
      request.setRequestHeader('Content-Type', 'application/json');
    }
    request.onload = () => {
      let parsed: any = {};
      try {
        parsed = request.responseText ? JSON.parse(request.responseText) : {};
      } catch (error) {
        reject(error);
        return;
      }
      if (request.status >= 200 && request.status < 300) {
        resolve(parsed as T);
      } else {
        reject(parsed);
      }
    };
    request.onerror = () => reject({ error: 'Network request failed' });
    request.send(options.body === undefined ? undefined : JSON.stringify(options.body));
  });
}

@Component({
  selector: 'app-admin-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <main class="admin-shell">
      <aside class="sidebar">
        <div class="brand">
          <h1>DDO Data Admin</h1>
          <span>{{entries.length}} affixes</span>
        </div>

        <input class="form-control form-control-sm" [(ngModel)]="searchText" placeholder="Search affixes">

        <div class="pipeline-summary">
          <span>Pipeline Health</span>
          <div>
            <strong>{{matchedEntryCount()}}</strong>
            <small>matched</small>
          </div>
          <div>
            <strong>{{staleEntryCount()}}</strong>
            <small>stale</small>
          </div>
          <div>
            <strong>{{candidateEntryCount()}}</strong>
            <small>with evidence</small>
          </div>
        </div>

        <div class="status-tabs">
          <button type="button" *ngFor="let status of statusFilters"
            [class.active]="statusFilter === status"
            (click)="statusFilter = status">
            {{status}}
          </button>
        </div>

        <div class="queue">
          <button type="button" *ngFor="let entry of filteredEntries()"
            [class.selected]="selected?.name === entry.name"
            (click)="select(entry)">
            <span>{{entry.name}}</span>
            <small [class]="entry.staleReason ? 'stale' : entry.status">{{entry.staleReason ? 'stale' : entry.status}}</small>
          </button>
        </div>
      </aside>

      <section class="detail" *ngIf="selected; else emptyState">
        <header class="detail-header">
          <div>
            <p>Compound Affixes</p>
            <h2>{{selected.name}}</h2>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-outline-secondary" (click)="selectPrevious()">Previous</button>
            <button type="button" class="btn btn-outline-secondary" (click)="selectNext()">Next</button>
          </div>
        </header>

        <div class="health-alert" *ngIf="selected.staleReason">
          <div>
            <strong>Stale suggestion</strong>
            <p>{{getStaleMessage(selected)}}</p>
          </div>
          <button type="button" class="btn btn-sm btn-outline-danger"
            *ngIf="selected.suggestion"
            (click)="quarantineSelected()">
            Quarantine Suggestion
          </button>
        </div>

        <section class="panel edit-panel">
          <div class="panel-title">
            <h3>Reviewed Definition</h3>
            <div class="component-actions">
              <button type="button" class="btn btn-sm btn-outline-secondary" (click)="sortComponentsByName()">Sort A-Z</button>
              <button type="button" class="btn btn-sm btn-outline-primary" (click)="addComponent()">Add Component</button>
            </div>
          </div>

          <div class="tooltip-example" *ngIf="getExampleTooltip()">
            <span>Example Tooltip</span>
            <p>{{getExampleTooltip()}}</p>
          </div>

          <datalist id="known-affix-names">
            <option *ngFor="let affixName of knownAffixNames" [value]="affixName"></option>
          </datalist>

          <div class="component-grid header-row">
            <span>Name</span>
            <span>Bonus Type</span>
            <span>Value Mode</span>
            <span>Amount</span>
            <span></span>
          </div>
          <div class="component-grid" *ngFor="let component of draft.components; let i = index"
            draggable="true"
            [class.dragging]="draggedComponentIndex === i"
            (dragstart)="onComponentDragStart(i, $event)"
            (dragover)="onComponentDragOver(i, $event)"
            (drop)="onComponentDrop(i, $event)"
            (dragend)="onComponentDragEnd()">
            <input class="form-control form-control-sm"
              list="known-affix-names"
              [class.unknown-affix]="!componentNameHasMatch(component)"
              [title]="getComponentNameTitle(component)"
              [(ngModel)]="component.name">
            <select class="form-select form-select-sm" [(ngModel)]="component.type">
              <option *ngFor="let type of allowedBonusTypes" [value]="type">{{type}}</option>
            </select>
            <select class="form-select form-select-sm" [(ngModel)]="component.value.mode">
              <option value="same_as_affix_number">same as affix number</option>
              <option value="fixed">fixed</option>
              <option value="boolean_one">boolean one</option>
            </select>
            <input class="form-control form-control-sm" type="number"
              [disabled]="component.value.mode !== 'fixed'"
              [(ngModel)]="component.value.amount">
            <div class="row-actions">
              <span class="drag-handle" title="Drag to reorder">&#9776;</span>
              <button type="button" class="icon-button" title="Remove component" (click)="removeComponent(i)">&times;</button>
            </div>
          </div>

          <label class="notes-label" for="review-notes">Review Notes</label>
          <textarea id="review-notes" class="form-control" rows="3" [(ngModel)]="reviewNotes"></textarea>

          <div class="save-row">
            <button type="button" class="btn btn-success" (click)="save('accepted')">Accept</button>
            <button type="button" class="btn btn-primary" (click)="save('tweaked')">Save Tweaked</button>
            <button type="button" class="btn btn-warning" (click)="save('needs-tweak')">Needs Tweak</button>
            <button type="button" class="btn btn-danger" (click)="save('rejected')">Reject</button>
            <span class="save-status">{{saveMessage}}</span>
          </div>
        </section>

        <section class="two-column">
          <div class="panel">
            <h3>LLM Suggestion</h3>
            <pre>{{(selected.suggestion || selected.llmResult) | json}}</pre>
          </div>
          <div class="panel">
            <h3>Evidence</h3>
            <div class="health-grid">
              <span [class.ok]="selected.nameMatchesCurrentAffix" [class.warn]="!selected.nameMatchesCurrentAffix">
                {{selected.nameMatchesCurrentAffix ? 'Name matches current parse' : 'No current parsed-name match'}}
              </span>
              <span [class.ok]="selected.candidatePresent" [class.muted]="!selected.candidatePresent">
                {{selected.candidatePresent ? 'Candidate evidence present' : 'No candidate record'}}
              </span>
              <span *ngIf="selected.suggestedCanonicalName" class="warn">
                Suggested: {{selected.suggestedCanonicalName}}
              </span>
            </div>
            <div *ngIf="selected.candidate; else noEvidence">
              <h4>Example Items</h4>
              <a *ngFor="let item of selected.candidate.exampleItems"
                [href]="'https://ddowiki.com' + item.itemUrl" target="_blank" rel="noreferrer">
                {{item.itemName}}
              </a>
              <h4>Tooltips</h4>
              <p *ngFor="let tooltip of selected.candidate.sourceTooltips">{{tooltip}}</p>
            </div>
            <ng-template #noEvidence><p>No candidate evidence found.</p></ng-template>
          </div>
        </section>

        <section class="panel">
          <h3>Parse Impact</h3>
          <div class="impact-table" *ngIf="selected.impact.length; else noImpact">
            <div class="impact-row impact-header">
              <span>Item</span>
              <span>Before</span>
              <span>After</span>
            </div>
            <div class="impact-row" *ngFor="let example of selected.impact">
              <a [href]="'https://ddowiki.com' + example.itemUrl" target="_blank" rel="noreferrer">{{example.itemName}}</a>
              <code>{{formatAffixes(example.before)}}</code>
              <code>{{formatAffixes(expandPreview(example.before[0]))}}</code>
            </div>
          </div>
          <ng-template #noImpact><p>No current item examples found.</p></ng-template>
        </section>
      </section>

      <ng-template #emptyState>
        <section class="detail empty">
          <h2>Select an affix to review</h2>
          <p>{{loadError || 'Loading review queue...'}}</p>
        </section>
      </ng-template>
    </main>
  `
})
export class AdminAppComponent {
  entries: ReviewEntry[] = [];
  selected: ReviewEntry | null = null;
  draft: CompoundAffixDefinition = { components: [] };
  reviewNotes = '';
  allowedBonusTypes: string[] = [];
  knownAffixNames: string[] = [];
  knownAffixNameSet = new Set<string>();
  searchText = '';
  statusFilter = 'all';
  statusFilters = ['all', 'unreviewed', 'accepted', 'tweaked', 'needs-tweak', 'rejected'];
  saveMessage = '';
  loadError = '';
  draggedComponentIndex: number | null = null;

  constructor(private changeDetector: ChangeDetectorRef) {
    this.load();
  }

  async load(selectedName?: string) {
    try {
      const payload = await requestJson<ReviewPayload>(`${API_ROOT}/api/compound-affixes/review`);
      this.entries = payload.entries;
      this.allowedBonusTypes = payload.allowedBonusTypes;
      this.knownAffixNames = payload.knownAffixNames || [];
      this.knownAffixNameSet = new Set(this.knownAffixNames.map(name => name.toLowerCase()));
      const preferredName = selectedName || this.getStoredSelectionName();
      const nextSelection = preferredName
        ? this.entries.find(entry => entry.name === preferredName)
        : this.entries[0];
      this.select(nextSelection || this.entries[0]);
    } catch (error) {
      this.loadError = `Could not load admin API at ${API_ROOT}.`;
      console.error(error);
    } finally {
      this.changeDetector.detectChanges();
    }
  }

  filteredEntries() {
    const query = this.searchText.trim().toLowerCase();
    return this.entries.filter(entry => {
      const matchesStatus = this.statusFilter === 'all' || entry.status === this.statusFilter;
      const matchesSearch = !query || entry.name.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }

  matchedEntryCount() {
    return this.entries.filter(entry => entry.nameMatchesCurrentAffix).length;
  }

  staleEntryCount() {
    return this.entries.filter(entry => entry.staleReason).length;
  }

  candidateEntryCount() {
    return this.entries.filter(entry => entry.candidatePresent).length;
  }

  select(entry: ReviewEntry) {
    if (!entry) return;
    this.selected = entry;
    this.draft = this.cloneDefinition(entry.reviewedDefinition || entry.suggestion || { components: [] });
    this.reviewNotes = entry.reviewNotes || '';
    this.saveMessage = '';
    this.storeSelectionName(entry.name);
  }

  selectPrevious() {
    this.moveSelection(-1);
  }

  selectNext() {
    this.moveSelection(1);
  }

  moveSelection(delta: number) {
    if (!this.selected) return;
    const visible = this.filteredEntries();
    const index = visible.findIndex(entry => entry.name === this.selected?.name);
    const next = visible[index + delta];
    if (next) this.select(next);
  }

  addComponent() {
    this.draft.components.push({
      name: '',
      type: '<TypeAlreadyParsed>',
      value: { mode: 'same_as_affix_number' }
    });
  }

  removeComponent(index: number) {
    this.draft.components.splice(index, 1);
  }

  onComponentDragStart(index: number, event: DragEvent) {
    this.draggedComponentIndex = index;
    event.dataTransfer?.setData('text/plain', String(index));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onComponentDragOver(index: number, event: DragEvent) {
    if (this.draggedComponentIndex === null || this.draggedComponentIndex === index) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onComponentDrop(index: number, event: DragEvent) {
    event.preventDefault();
    if (this.draggedComponentIndex === null || this.draggedComponentIndex === index) {
      this.draggedComponentIndex = null;
      return;
    }
    const [component] = this.draft.components.splice(this.draggedComponentIndex, 1);
    this.draft.components.splice(index, 0, component);
    this.draggedComponentIndex = null;
  }

  onComponentDragEnd() {
    this.draggedComponentIndex = null;
  }

  sortComponentsByName() {
    this.draft.components.sort((left, right) => left.name.localeCompare(right.name));
  }

  async save(status: Exclude<ReviewStatus, 'unreviewed'>) {
    if (!this.selected) return;
    this.saveMessage = 'Saving...';
    try {
      await requestJson(`${API_ROOT}/api/compound-affixes/review/${encodeURIComponent(this.selected.name)}`, {
      method: 'POST',
        body: {
        status,
        notes: this.reviewNotes,
        definition: this.draft
        }
      });
    } catch (error: any) {
      this.saveMessage = error?.error || 'Save failed';
      return;
    }
    this.saveMessage = 'Saved';
    await this.load(this.selected.name);
    this.changeDetector.detectChanges();
  }

  async quarantineSelected() {
    if (!this.selected) return;
    const name = this.selected.name;
    this.saveMessage = 'Quarantining...';
    try {
      await requestJson(`${API_ROOT}/api/compound-affixes/stale-suggestions/${encodeURIComponent(name)}/quarantine`, {
        method: 'POST'
      });
    } catch (error: any) {
      this.saveMessage = error?.error || 'Quarantine failed';
      return;
    }
    this.saveMessage = 'Quarantined';
    await this.load(name);
    this.changeDetector.detectChanges();
  }

  cloneDefinition(definition: CompoundAffixDefinition): CompoundAffixDefinition {
    return JSON.parse(JSON.stringify(definition));
  }

  componentNameHasMatch(component: CompoundAffixComponent) {
    const name = component.name.trim();
    return !name || this.knownAffixNameSet.has(name.toLowerCase());
  }

  getComponentNameTitle(component: CompoundAffixComponent) {
    return this.componentNameHasMatch(component)
      ? 'Known affix name'
      : 'No matching known affix name';
  }

  getStaleMessage(entry: ReviewEntry) {
    if (entry.suggestedCanonicalName) {
      return `No current parsed affix uses this exact name. Current data appears to use "${entry.suggestedCanonicalName}" instead.`;
    }
    return 'No current parsed affix uses this exact name, so accepting it would not change any current item parses.';
  }

  getStoredSelectionName() {
    const urlName = new URLSearchParams(window.location.search).get('affix');
    return urlName || localStorage.getItem(SELECTED_AFFIX_STORAGE_KEY) || '';
  }

  storeSelectionName(name: string) {
    localStorage.setItem(SELECTED_AFFIX_STORAGE_KEY, name);
    const url = new URL(window.location.href);
    url.searchParams.set('affix', name);
    window.history.replaceState({}, '', url);
  }

  getExampleTooltip() {
    return this.selected?.candidate?.sourceTooltips?.[0]
      || this.selected?.exampleTooltip
      || this.selected?.impact?.[0]?.before?.[0]?.sourceTooltip
      || this.selected?.candidate?.originalNames?.[0]
      || this.selected?.impact?.[0]?.before?.[0]?.sourceText
      || '';
  }

  formatAffixes(affixes: any[]) {
    return affixes.map(affix => {
      const value = affix.value && affix.value !== 1 ? ` ${affix.value}` : '';
      const type = affix.type && affix.type !== 'Bool' ? ` ${affix.type}` : '';
      return `${affix.name}${value}${type}`;
    }).join('; ');
  }

  expandPreview(baseAffix: any) {
    if (!baseAffix || !this.draft.components.length) {
      return baseAffix ? [baseAffix] : [];
    }

    const expanded = this.draft.components
      .filter(component => component.name.trim())
      .map(component => ({
        name: component.name.trim(),
        type: this.materializeType(component, baseAffix),
        value: this.materializeValue(component, baseAffix)
      }));

    return expanded.length ? expanded : [baseAffix];
  }

  materializeType(component: CompoundAffixComponent, baseAffix: any) {
    return component.type === '<TypeAlreadyParsed>' || component.type === '__inherit_type__'
      ? baseAffix.type
      : component.type;
  }

  materializeValue(component: CompoundAffixComponent, baseAffix: any) {
    if (component.value.mode === 'fixed') {
      return Number(component.value.amount ?? 0);
    }
    if (component.value.mode === 'boolean_one') {
      return 1;
    }
    return baseAffix.value;
  }
}

bootstrapApplication(AdminAppComponent, {
  providers: [
    provideZoneChangeDetection()
  ]
}).catch(err => console.error(err));
