import { ChangeDetectorRef, provideZoneChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

type ValueMode = 'same_as_affix_number' | 'fixed' | 'boolean_one';
type ReviewStatus = 'unreviewed' | 'accepted' | 'tweaked' | 'needs-tweak' | 'rejected';
type AdminView = 'compound-affixes' | 'affix-names';

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

interface AffixNameExample {
  asset: string;
  parentName: string;
  path: string;
  url?: string;
  type: string;
  value: string;
  sourceText?: string;
  sourceTooltip?: string;
}

interface AffixNameEntry {
  name: string;
  count: number;
  assets: Record<string, number>;
  types: Record<string, number>;
  values: Record<string, number>;
  examples: AffixNameExample[];
  reviewStatus: 'unreviewed' | 'ok';
  reviewNotes?: string;
  reviewedAt?: string;
  signals: string[];
  clusterIds: string[];
  hasCompoundAffixDefinition: boolean;
  synonymCanonicalName?: string;
  isCanonicalSynonymName: boolean;
  hasSynonymCoverage: boolean;
}

interface AffixNameCluster {
  id: string;
  names: string[];
  totalCount: number;
}

interface AffixNamePayload {
  entries: AffixNameEntry[];
  clusters: AffixNameCluster[];
  synonyms: Array<{ name: string; synonyms: string[] }>;
  backlog: any[];
  summary: {
    totalNames: number;
    oneOffNames: number;
    twoOffNames: number;
    threeOffNames: number;
    lowCountNoCompoundNames: number;
    suspiciousNames: number;
    reviewedNames: number;
    clusters: number;
  };
}

const API_ROOT = 'http://127.0.0.1:8765';
const ACTIVE_VIEW_STORAGE_KEY = 'ddo-admin-active-view';
const SELECTED_AFFIX_STORAGE_KEY = 'ddo-admin-selected-affix';
const SELECTED_AFFIX_NAME_STORAGE_KEY = 'ddo-admin-selected-affix-name';

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
          <span>{{activeView === 'compound-affixes' ? entries.length : affixNameEntries.length}} affixes</span>
        </div>

        <div class="admin-nav">
          <button type="button" [class.active]="activeView === 'compound-affixes'" (click)="setActiveView('compound-affixes')">
            Compound Affixes
          </button>
          <button type="button" [class.active]="activeView === 'affix-names'" (click)="setActiveView('affix-names')">
            Affix Names
          </button>
        </div>

        <input *ngIf="activeView === 'compound-affixes'" class="form-control form-control-sm" [(ngModel)]="searchText" placeholder="Search compound affixes">
        <input *ngIf="activeView === 'affix-names'" class="form-control form-control-sm" [(ngModel)]="affixNameSearchText" placeholder="Search affix names">

        <div class="pipeline-summary" *ngIf="activeView === 'compound-affixes'">
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

        <div class="pipeline-summary" *ngIf="activeView === 'affix-names'">
          <span>Name Quality</span>
          <div>
            <strong>{{affixNamePayload?.summary?.totalNames || 0}}</strong>
            <small>names</small>
          </div>
          <div>
            <strong>{{affixNamePayload?.summary?.suspiciousNames || 0}}</strong>
            <small>flagged</small>
          </div>
          <div>
            <strong>{{affixNamePayload?.summary?.twoOffNames || 0}}/{{affixNamePayload?.summary?.threeOffNames || 0}}</strong>
            <small>2/3-off</small>
          </div>
          <div>
            <strong>{{affixNamePayload?.summary?.lowCountNoCompoundNames || 0}}</strong>
            <small>low no compound</small>
          </div>
          <div>
            <strong>{{affixNamePayload?.summary?.clusters || 0}}</strong>
            <small>clusters</small>
          </div>
          <div>
            <strong>{{affixNamePayload?.summary?.reviewedNames || 0}}</strong>
            <small>reviewed</small>
          </div>
        </div>

        <div class="status-tabs" *ngIf="activeView === 'compound-affixes'">
          <button type="button" *ngFor="let status of statusFilters"
            [class.active]="statusFilter === status"
            (click)="statusFilter = status">
            {{status}}
          </button>
        </div>

        <div class="status-tabs" *ngIf="activeView === 'affix-names'">
          <button type="button" *ngFor="let filter of affixNameFilters"
            [class.active]="affixNameFilter === filter"
            (click)="affixNameFilter = filter">
            {{filter}}
          </button>
        </div>

        <div class="queue" *ngIf="activeView === 'compound-affixes'">
          <button type="button" *ngFor="let entry of filteredEntries()"
            [class.selected]="selected?.name === entry.name"
            (click)="select(entry)">
            <span>{{entry.name}}</span>
            <small [class]="entry.staleReason ? 'stale' : entry.status">{{entry.staleReason ? 'stale' : entry.status}}</small>
          </button>
        </div>

        <div class="queue affix-name-queue" *ngIf="activeView === 'affix-names'">
          <button type="button" *ngFor="let entry of filteredAffixNameEntries()"
            [class.selected]="selectedAffixName?.name === entry.name"
            (click)="selectAffixName(entry)">
            <span>{{entry.name}}</span>
            <small [class]="getAffixNameBadgeClass(entry)">{{getAffixNameBadge(entry)}}</small>
          </button>
        </div>
      </aside>

      <section class="detail" *ngIf="activeView === 'compound-affixes' && selected">
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

      <section class="detail" *ngIf="activeView === 'affix-names' && selectedAffixName">
        <header class="detail-header">
          <div>
            <p>Affix Names</p>
            <h2>{{selectedAffixName.name}}</h2>
          </div>
          <div class="actions">
            <button type="button" class="btn btn-outline-secondary" (click)="selectPreviousAffixName()">Previous</button>
            <button type="button" class="btn btn-outline-secondary" (click)="selectNextAffixName()">Next</button>
          </div>
        </header>

        <section class="panel">
          <div class="affix-name-meta">
            <span>{{selectedAffixName.count}} occurrences</span>
            <span *ngFor="let asset of objectEntries(selectedAffixName.assets)">{{asset.key}}: {{asset.value}}</span>
            <span *ngIf="selectedAffixName.reviewStatus === 'ok'" class="ok">reviewed ok</span>
            <span *ngIf="selectedAffixName.hasSynonymCoverage" class="ok">synonym covered</span>
            <span *ngIf="!selectedAffixName.hasSynonymCoverage" class="warn">no synonym coverage</span>
          </div>
          <div class="health-grid">
            <span *ngFor="let signal of selectedAffixName.signals" class="warn">{{signal}}</span>
            <span *ngIf="!selectedAffixName.signals.length" class="ok">no quality signals</span>
            <span *ngIf="selectedAffixName.synonymCanonicalName" class="ok">maps to {{selectedAffixName.synonymCanonicalName}}</span>
            <span *ngIf="selectedAffixName.isCanonicalSynonymName" class="ok">canonical synonym name</span>
          </div>
        </section>

        <section class="two-column">
          <div class="panel">
            <h3>Review</h3>
            <label class="notes-label" for="affix-name-review-notes">Review Notes</label>
            <textarea id="affix-name-review-notes" class="form-control" rows="3" [(ngModel)]="affixNameReviewNotes"></textarea>
            <div class="save-row">
              <button type="button" class="btn btn-success" (click)="saveAffixNameReview('ok')">Mark OK</button>
              <button type="button" class="btn btn-outline-secondary" (click)="saveAffixNameReview('unreviewed')">Clear Review</button>
              <span class="save-status">{{affixNameSaveMessage}}</span>
            </div>

            <h3>Fix With Synonym</h3>
            <datalist id="final-affix-names">
              <option *ngFor="let name of affixNameOptions" [value]="name"></option>
            </datalist>
            <label class="notes-label" for="canonical-name">Canonical Name</label>
            <input id="canonical-name" class="form-control" list="final-affix-names" [(ngModel)]="synonymCanonicalName">
            <label class="notes-label" for="synonym-names">Synonyms</label>
            <textarea id="synonym-names" class="form-control" rows="3" [(ngModel)]="synonymNamesText"></textarea>
            <div class="save-row">
              <button type="button" class="btn btn-primary" (click)="saveAffixSynonyms()">Save Synonym Mapping</button>
            </div>

            <h4>Likely Duplicate Clusters</h4>
            <div *ngIf="getSelectedClusters().length; else noClusters">
              <div class="cluster" *ngFor="let cluster of getSelectedClusters()">
                <button type="button" *ngFor="let name of cluster.names"
                  [class.selected]="name === selectedAffixName.name"
                  (click)="useClusterName(name)">
                  {{name}}
                </button>
              </div>
            </div>
            <ng-template #noClusters><p>No likely duplicate cluster found.</p></ng-template>
          </div>

          <div class="panel">
            <h3>Parser Backlog</h3>
            <label class="notes-label" for="parser-note">Note</label>
            <textarea id="parser-note" class="form-control" rows="5" [(ngModel)]="parserBacklogNote"></textarea>
            <div class="save-row">
              <button type="button" class="btn btn-warning" (click)="saveParserBacklog()">Flag Parser Problem</button>
            </div>

            <h4>Compound Affix Review</h4>
            <div class="save-row">
              <button type="button" class="btn btn-outline-primary" (click)="sendToCompoundReview()">Send to Compound Review</button>
            </div>

            <h4>Type Distribution</h4>
            <div class="distribution-row" *ngFor="let type of objectEntries(selectedAffixName.types)">
              <span>{{type.key}}</span><strong>{{type.value}}</strong>
            </div>
            <h4>Value Distribution</h4>
            <div class="distribution-row" *ngFor="let value of objectEntries(selectedAffixName.values).slice(0, 8)">
              <span>{{value.key}}</span><strong>{{value.value}}</strong>
            </div>
          </div>
        </section>

        <section class="panel">
          <h3>Examples</h3>
          <div class="impact-table">
            <div class="impact-row impact-header">
              <span>Source</span>
              <span>Parse</span>
              <span>Tooltip</span>
            </div>
            <div class="impact-row" *ngFor="let example of selectedAffixName.examples">
              <div class="example-source">
                <strong>{{example.asset}}</strong>
                <a *ngIf="example.url" [href]="'https://ddowiki.com' + example.url" target="_blank" rel="noreferrer">{{example.parentName}}</a>
                <span *ngIf="!example.url">{{example.parentName}}</span>
              </div>
              <code>{{selectedAffixName.name}} {{example.value}} {{example.type}}</code>
              <code>{{example.sourceTooltip || example.sourceText || example.path}}</code>
            </div>
          </div>
        </section>
      </section>

      <section class="detail empty" *ngIf="activeView === 'compound-affixes' && !selected">
        <h2>Select a compound affix to review</h2>
        <p>{{loadError || 'Loading review queue...'}}</p>
      </section>

      <section class="detail empty" *ngIf="activeView === 'affix-names' && !selectedAffixName">
        <h2>Select an affix name to review</h2>
        <p>{{affixNameLoadError || 'Loading affix names...'}}</p>
      </section>
    </main>
  `
})
export class AdminAppComponent {
  activeView: AdminView = this.getStoredActiveView();
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
  affixNamePayload: AffixNamePayload | null = null;
  affixNameEntries: AffixNameEntry[] = [];
  selectedAffixName: AffixNameEntry | null = null;
  affixNameOptions: string[] = [];
  affixNameSearchText = '';
  affixNameFilter = 'all';
  affixNameFilters = ['all', 'unreviewed', 'reviewed', 'one-off', 'two-off', 'three-off', 'low-count-no-compound', 'long-name', 'sentence-like-name', 'value-like-name', 'likely-duplicate', 'has-synonym', 'no-synonym', 'items', 'crafting', 'sets', 'affix-groups'];
  synonymCanonicalName = '';
  synonymNamesText = '';
  parserBacklogNote = '';
  affixNameReviewNotes = '';
  affixNameSaveMessage = '';
  affixNameLoadError = '';

  constructor(private changeDetector: ChangeDetectorRef) {
    this.load();
    this.loadAffixNames();
  }

  setActiveView(view: AdminView) {
    this.activeView = view;
    this.storeActiveView(view);
    if (view === 'affix-names' && !this.affixNameEntries.length) {
      this.loadAffixNames();
    }
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

  filteredAffixNameEntries() {
    const query = this.affixNameSearchText.trim().toLowerCase();
    return this.affixNameEntries.filter(entry => {
      const matchesSearch = !query || entry.name.toLowerCase().includes(query);
      if (!matchesSearch) return false;
      if (this.affixNameFilter === 'all') return true;
      if (this.affixNameFilter === 'reviewed') return entry.reviewStatus === 'ok';
      if (this.affixNameFilter === 'unreviewed') return entry.reviewStatus !== 'ok';
      if (this.affixNameFilter === 'has-synonym') return entry.hasSynonymCoverage;
      if (this.affixNameFilter === 'no-synonym') return !entry.hasSynonymCoverage;
      if (['items', 'crafting', 'sets', 'affix-groups'].includes(this.affixNameFilter)) {
        return !!entry.assets[this.affixNameFilter];
      }
      return entry.signals.includes(this.affixNameFilter);
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

  async loadAffixNames(selectedName?: string) {
    try {
      const payload = await requestJson<AffixNamePayload>(`${API_ROOT}/api/affix-names/review`);
      this.affixNamePayload = payload;
      this.affixNameEntries = payload.entries;
      this.affixNameOptions = payload.entries.map(entry => entry.name).sort((left, right) => left.localeCompare(right));
      const preferredName = selectedName || this.getStoredAffixNameSelectionName();
      const nextSelection = preferredName
        ? this.affixNameEntries.find(entry => entry.name === preferredName)
        : this.affixNameEntries[0];
      this.selectAffixName(nextSelection || this.affixNameEntries[0]);
    } catch (error) {
      this.affixNameLoadError = `Could not load affix name API at ${API_ROOT}.`;
      console.error(error);
    } finally {
      this.changeDetector.detectChanges();
    }
  }

  select(entry: ReviewEntry) {
    if (!entry) return;
    this.selected = entry;
    this.draft = this.cloneDefinition(entry.reviewedDefinition || entry.suggestion || { components: [] });
    this.reviewNotes = entry.reviewNotes || '';
    this.saveMessage = '';
    this.storeSelectionName(entry.name);
  }

  selectAffixName(entry: AffixNameEntry) {
    if (!entry) return;
    this.selectedAffixName = entry;
    this.synonymCanonicalName = entry.synonymCanonicalName || entry.name;
    this.synonymNamesText = entry.synonymCanonicalName ? entry.name : '';
    this.parserBacklogNote = '';
    this.affixNameReviewNotes = entry.reviewNotes || '';
    this.affixNameSaveMessage = '';
    this.storeAffixNameSelectionName(entry.name);
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

  selectPreviousAffixName() {
    this.moveAffixNameSelection(-1);
  }

  selectNextAffixName() {
    this.moveAffixNameSelection(1);
  }

  moveAffixNameSelection(delta: number) {
    if (!this.selectedAffixName) return;
    const visible = this.filteredAffixNameEntries();
    const index = visible.findIndex(entry => entry.name === this.selectedAffixName?.name);
    const next = visible[index + delta];
    if (next) this.selectAffixName(next);
  }

  objectEntries(record: Record<string, number>) {
    return Object.entries(record || {})
      .map(([key, value]) => ({ key, value }))
      .sort((left, right) => Number(right.value) - Number(left.value) || left.key.localeCompare(right.key));
  }

  getSelectedClusters() {
    if (!this.selectedAffixName || !this.affixNamePayload) return [];
    const ids = new Set(this.selectedAffixName.clusterIds);
    return this.affixNamePayload.clusters.filter(cluster => ids.has(cluster.id));
  }

  useClusterName(name: string) {
    if (!this.selectedAffixName) return;
    this.synonymCanonicalName = name;
    this.synonymNamesText = this.selectedAffixName.name === name ? '' : this.selectedAffixName.name;
  }

  getAffixNameBadge(entry: AffixNameEntry) {
    return entry.reviewStatus === 'ok' ? 'ok' : String(entry.count);
  }

  getAffixNameBadgeClass(entry: AffixNameEntry) {
    if (entry.reviewStatus === 'ok') return 'accepted';
    return entry.signals.length ? 'stale' : 'unreviewed';
  }

  async saveAffixNameReview(status: 'ok' | 'unreviewed') {
    if (!this.selectedAffixName) return;
    const name = this.selectedAffixName.name;
    this.affixNameSaveMessage = status === 'ok' ? 'Marking reviewed...' : 'Clearing review...';
    try {
      await requestJson(`${API_ROOT}/api/affix-names/review/${encodeURIComponent(name)}`, {
        method: 'POST',
        body: {
          status,
          notes: this.affixNameReviewNotes,
        }
      });
    } catch (error: any) {
      this.affixNameSaveMessage = error?.error || 'Save failed';
      return;
    }
    this.affixNameSaveMessage = status === 'ok' ? 'Marked OK' : 'Review cleared';
    await this.loadAffixNames(name);
  }

  async saveAffixSynonyms() {
    if (!this.selectedAffixName) return;
    const synonyms = this.synonymNamesText
      .split(/\r?\n|,/)
      .map(name => name.trim())
      .filter(name => name);
    this.affixNameSaveMessage = 'Saving...';
    try {
      await requestJson(`${API_ROOT}/api/affix-names/synonyms`, {
        method: 'POST',
        body: {
          canonicalName: this.synonymCanonicalName,
          synonyms,
        }
      });
    } catch (error: any) {
      this.affixNameSaveMessage = error?.error || 'Save failed';
      return;
    }
    this.affixNameSaveMessage = 'Saved';
    await this.loadAffixNames(this.selectedAffixName.name);
  }

  async saveParserBacklog() {
    if (!this.selectedAffixName) return;
    this.affixNameSaveMessage = 'Saving parser issue...';
    try {
      await requestJson(`${API_ROOT}/api/affix-names/parser-backlog`, {
        method: 'POST',
        body: {
          name: this.selectedAffixName.name,
          note: this.parserBacklogNote,
          examples: this.selectedAffixName.examples,
        }
      });
    } catch (error: any) {
      this.affixNameSaveMessage = error?.error || 'Save failed';
      return;
    }
    this.affixNameSaveMessage = 'Parser issue saved';
    this.parserBacklogNote = '';
    await this.loadAffixNames(this.selectedAffixName.name);
  }

  async sendToCompoundReview() {
    if (!this.selectedAffixName) return;
    const name = this.selectedAffixName.name;
    this.affixNameSaveMessage = 'Sending to compound review...';
    try {
      await requestJson(`${API_ROOT}/api/affix-names/compound-candidate`, {
        method: 'POST',
        body: { name }
      });
    } catch (error: any) {
      this.affixNameSaveMessage = error?.error || 'Send failed';
      return;
    }
    this.affixNameSaveMessage = 'Sent to compound review';
    await this.load(name);
    this.setActiveView('compound-affixes');
    this.changeDetector.detectChanges();
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

  getStoredAffixNameSelectionName() {
    const urlName = new URLSearchParams(window.location.search).get('affixName');
    return urlName || localStorage.getItem(SELECTED_AFFIX_NAME_STORAGE_KEY) || '';
  }

  storeAffixNameSelectionName(name: string) {
    localStorage.setItem(SELECTED_AFFIX_NAME_STORAGE_KEY, name);
    const url = new URL(window.location.href);
    url.searchParams.set('affixName', name);
    window.history.replaceState({}, '', url);
  }

  getStoredActiveView(): AdminView {
    const urlView = new URLSearchParams(window.location.search).get('view');
    if (urlView === 'affix-names' || urlView === 'compound-affixes') {
      return urlView;
    }
    const storedView = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
    return storedView === 'affix-names' || storedView === 'compound-affixes' ? storedView : 'compound-affixes';
  }

  storeActiveView(view: AdminView) {
    localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, view);
    const url = new URL(window.location.href);
    url.searchParams.set('view', view);
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
