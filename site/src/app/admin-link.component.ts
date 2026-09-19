import { ChangeDetectionStrategy, Component, HostListener } from '@angular/core';
import { environment } from '../environments/environment';
import { BuildUrlCodecService, BuildUrlInspection } from './build-url-codec.service';
import { PlannerOnboardingService } from './planner-onboarding.service';

type UrlParamRecord = Record<string, string | string[]>;
type UrlInspectorView = 'compact' | 'effective' | 'human';

interface UrlDataInspection {
  source: string;
  route: string;
  queryString: string;
  rawParams: UrlParamRecord;
  compactParam?: string;
  compactInspection?: BuildUrlInspection;
  effectiveParams: UrlParamRecord;
}

interface HumanReadableUrlData {
  filters: Record<string, unknown>;
  equipment: Record<string, { item: string; minimumLevel?: string; crafting?: Array<{ system: string; selected: string }> }>;
  tracked: string[];
  nonGear: Array<{ affix: string; bonusType: string; kind: string; value: number; label: string }>;
  other: UrlParamRecord;
}

const SLOT_ORDER = [
  'Weapon',
  'Offhand',
  'Armor',
  'Belt',
  'Boots',
  'Bracers',
  'Cloak',
  'Gloves',
  'Goggles',
  'Helm',
  'Necklace',
  'Ring1',
  'Ring2',
  'Trinket',
  'Quiver'
];

const FILTER_LABELS: Record<string, string> = {
  levelrange: 'levelRange',
  raids: 'showRaidItems',
  rare: 'showRareItems',
  hiddentypes: 'hiddenItemTypes',
  hiddenpacks: 'hiddenPacks'
};

@Component({
  selector: 'app-admin-link',
  template: `
    <div class="admin-menu" *ngIf="!isProduction" (click)="$event.stopPropagation()">
      <button
        class="admin-button"
        type="button"
        [attr.aria-expanded]="panelOpen"
        aria-haspopup="menu"
        (click)="togglePanel()"
      >
        Admin
      </button>

      <div *ngIf="panelOpen" class="admin-panel" role="menu">
        <label class="admin-toggle">
          <span>
            <strong>Performance logging</strong>
            <small>Console timing traces</small>
          </span>
          <input
            type="checkbox"
            [checked]="performanceLoggingEnabled"
            (change)="setPerformanceLogging($event)"
          >
        </label>

        <button type="button" class="admin-panel-action" role="menuitem" (click)="resetOnboarding()">
          <span>
            <strong>Reset onboarding</strong>
            <small>Show intro cues again</small>
          </span>
        </button>

        <button type="button" class="admin-panel-action" role="menuitem" (click)="openUrlInspector()">
          <span>
            <strong>Inspect URL data</strong>
            <small>Decode compact build params</small>
          </span>
        </button>

        <a class="admin-panel-link" [href]="adminUrl" role="menuitem">Open admin page</a>
      </div>

      <div *ngIf="inspectorOpen" class="admin-modal-backdrop" role="presentation" (click)="closeUrlInspector()"></div>
      <section
        *ngIf="inspectorOpen"
        class="admin-url-inspector"
        role="dialog"
        aria-modal="true"
        aria-label="URL data inspector"
        (click)="$event.stopPropagation()"
      >
        <header class="admin-url-inspector-header">
          <div>
            <strong>URL Data</strong>
            <small>{{ urlDataSummary }}</small>
          </div>
          <button type="button" class="admin-close-button" aria-label="Close URL data inspector" (click)="closeUrlInspector()">x</button>
        </header>

        <label class="admin-url-input">
          <span>URL or fragment</span>
          <textarea rows="3" [(ngModel)]="inspectorInput" (input)="inspectUrl()"></textarea>
        </label>

        <dl class="admin-url-stats">
          <div>
            <dt>Format</dt>
            <dd>{{ urlDataFormat }}</dd>
          </div>
          <div>
            <dt>Route</dt>
            <dd>{{ inspectedUrlData?.route || '/' }}</dd>
          </div>
          <div>
            <dt>Params</dt>
            <dd>{{ effectiveParamCount }}</dd>
          </div>
          <div>
            <dt>Payload length</dt>
            <dd>{{ payloadChars ?? '-' }}</dd>
          </div>
        </dl>

        <div class="admin-url-view-tabs" role="tablist" aria-label="URL data view">
          <button
            type="button"
            role="tab"
            [class.active]="urlInspectorView === 'compact'"
            [attr.aria-selected]="urlInspectorView === 'compact'"
            (click)="setUrlInspectorView('compact')"
          >Compact</button>
          <button
            type="button"
            role="tab"
            [class.active]="urlInspectorView === 'effective'"
            [attr.aria-selected]="urlInspectorView === 'effective'"
            (click)="setUrlInspectorView('effective')"
          >Effective Params</button>
          <button
            type="button"
            role="tab"
            [class.active]="urlInspectorView === 'human'"
            [attr.aria-selected]="urlInspectorView === 'human'"
            (click)="setUrlInspectorView('human')"
          >Human Readable</button>
        </div>

        <pre class="admin-url-json">{{ urlInspectionJson }}</pre>
      </section>
    </div>
  `,
  styles: [`
    :host {
      align-self: stretch;
      display: inline-flex;
      flex: 0 0 auto;
      margin-left: 0.4rem;
      position: relative;
    }

    .admin-menu {
      align-self: stretch;
      display: inline-flex;
      font-size: 0.875rem;
      position: relative;
    }

    .admin-button {
      align-items: center;
      background: var(--surface-subtle-color);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-weight: 700;
      justify-content: center;
      line-height: 1.2;
      min-height: 2rem;
      padding: 0.35rem 0.65rem;
    }

    .admin-button:hover,
    .admin-button:focus {
      color: var(--primary-color);
    }

    .admin-button:focus-visible {
      outline: 3px solid var(--focus-ring-color);
      outline-offset: 2px;
    }

    .admin-panel {
      position: absolute;
      right: 0;
      top: calc(100% + 0.4rem);
      width: 15rem;
      padding: 0.7rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--surface-elevated-color);
      color: var(--text-primary);
      box-shadow: var(--shadow-lg);
      z-index: 1200;
    }

    .admin-toggle {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin: 0 0 0.65rem;
      cursor: pointer;
    }

    .admin-toggle strong,
    .admin-toggle small {
      display: block;
    }

    .admin-toggle strong {
      font-size: 0.85rem;
      line-height: 1.2;
    }

    .admin-toggle small {
      margin-top: 0.15rem;
      color: var(--text-secondary);
      font-size: 0.75rem;
    }

    .admin-toggle input {
      width: 1rem;
      height: 1rem;
      flex: 0 0 auto;
      cursor: pointer;
    }

    .admin-panel-link {
      display: block;
      padding-top: 0.65rem;
      border-top: 1px solid var(--border-color);
      color: var(--link-color);
      text-decoration: none;
    }

    .admin-panel-action {
      align-items: flex-start;
      background: transparent;
      border: 0;
      border-top: 1px solid var(--border-color);
      color: var(--text-primary);
      cursor: pointer;
      display: flex;
      font: inherit;
      margin: 0;
      padding: 0.65rem 0 0;
      text-align: left;
      width: 100%;
    }

    .admin-panel-action strong,
    .admin-panel-action small {
      display: block;
    }

    .admin-panel-action strong {
      font-size: 0.85rem;
      line-height: 1.2;
    }

    .admin-panel-action small {
      color: var(--text-secondary);
      font-size: 0.75rem;
      margin-top: 0.15rem;
    }

    .admin-panel-action:hover strong,
    .admin-panel-action:focus strong {
      color: var(--primary-color);
    }

    .admin-panel-link:hover,
    .admin-panel-link:focus {
      color: var(--link-hover-color);
      text-decoration: underline;
    }

    .admin-modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.35);
      z-index: 1290;
    }

    .admin-url-inspector {
      position: fixed;
      right: 1rem;
      top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
      width: min(48rem, calc(100vw - 2rem));
      max-height: calc(100vh - 2rem);
      padding: 1rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--surface-elevated-color);
      color: var(--text-primary);
      box-shadow: var(--shadow-lg);
      z-index: 1300;
    }

    .admin-url-inspector-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 1rem;
    }

    .admin-url-inspector-header strong,
    .admin-url-inspector-header small,
    .admin-url-input span {
      display: block;
    }

    .admin-url-inspector-header strong {
      font-size: 1rem;
      line-height: 1.2;
    }

    .admin-url-inspector-header small,
    .admin-url-input span {
      color: var(--text-secondary);
      font-size: 0.8rem;
      margin-top: 0.15rem;
    }

    .admin-close-button {
      align-items: center;
      background: transparent;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      color: var(--text-secondary);
      cursor: pointer;
      display: inline-flex;
      font: inherit;
      font-weight: 700;
      height: 2rem;
      justify-content: center;
      line-height: 1;
      width: 2rem;
    }

    .admin-close-button:hover,
    .admin-close-button:focus {
      color: var(--primary-color);
    }

    .admin-url-input {
      margin: 0;
    }

    .admin-url-input textarea {
      width: 100%;
      margin-top: 0.35rem;
      padding: 0.55rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--surface-color);
      color: var(--text-primary);
      font: 0.8rem/1.4 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      resize: vertical;
    }

    .admin-url-stats {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0.5rem;
      margin: 0;
    }

    .admin-url-stats div {
      min-width: 0;
      padding: 0.55rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--surface-subtle-color);
    }

    .admin-url-stats dt {
      color: var(--text-secondary);
      font-size: 0.72rem;
      font-weight: 700;
      margin: 0 0 0.2rem;
      text-transform: uppercase;
    }

    .admin-url-stats dd {
      overflow-wrap: anywhere;
      font-size: 0.85rem;
      font-weight: 700;
      margin: 0;
    }

    .admin-url-view-tabs {
      align-items: center;
      background: var(--surface-subtle-color);
      border: 1px solid var(--border-color);
      border-radius: 6px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.15rem;
      padding: 0.18rem;
    }

    .admin-url-view-tabs button {
      background: transparent;
      border: 0;
      border-radius: 5px;
      color: var(--text-secondary);
      cursor: pointer;
      font: inherit;
      font-size: 0.82rem;
      font-weight: 800;
      line-height: 1.2;
      min-height: 2rem;
      padding: 0.35rem 0.5rem;
    }

    .admin-url-view-tabs button:hover,
    .admin-url-view-tabs button:focus {
      color: var(--primary-color);
    }

    .admin-url-view-tabs button.active {
      background: var(--surface-elevated-color);
      box-shadow: var(--shadow-sm);
      color: var(--text-primary);
    }

    .admin-url-json {
      min-height: 12rem;
      max-height: 58vh;
      margin: 0;
      overflow: auto;
      padding: 0.75rem;
      border: 1px solid var(--border-color);
      border-radius: 6px;
      background: var(--surface-color);
      color: var(--text-primary);
      font: 0.78rem/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      white-space: pre-wrap;
    }

    @media (max-width: 767.98px) {
      :host {
        align-self: flex-end;
        margin-top: 0.4rem;
      }

      .admin-url-inspector {
        inset: 0;
        width: auto;
        max-height: none;
        border-radius: 0;
      }

      .admin-url-stats {
        grid-template-columns: 1fr;
      }

      .admin-url-view-tabs {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false
})
export class AdminLinkComponent {
  isProduction = environment.production;
  adminUrl = environment.adminUrl;
  panelOpen = false;
  inspectorOpen = false;
  inspectorInput = '';
  inspectedUrlData: UrlDataInspection | null = null;
  urlInspectionJson = '';
  urlInspectorView: UrlInspectorView = 'human';
  urlDataSummary = 'Current build URL data';
  urlDataFormat = 'None';
  effectiveParamCount = 0;
  payloadChars: number | null = null;
  performanceLoggingEnabled = this.getPerformanceLogging();

  constructor(
    private onboarding: PlannerOnboardingService,
    private buildUrlCodec: BuildUrlCodecService
  ) {}

  @HostListener('document:click')
  closePanel() {
    this.panelOpen = false;
  }

  togglePanel() {
    this.panelOpen = !this.panelOpen;
  }

  setPerformanceLogging(event: Event) {
    const input = event.target as HTMLInputElement;
    this.performanceLoggingEnabled = input.checked;

    try {
      if (this.performanceLoggingEnabled) {
        localStorage.setItem('ddoPerf', '1');
      } else {
        localStorage.removeItem('ddoPerf');
      }
    } catch {
      this.performanceLoggingEnabled = false;
    }
  }

  resetOnboarding() {
    this.onboarding.resetIntro();
    this.panelOpen = false;
  }

  openUrlInspector() {
    this.inspectorInput = window.location.href;
    this.inspectUrl();
    this.inspectorOpen = true;
    this.panelOpen = false;
  }

  closeUrlInspector() {
    this.inspectorOpen = false;
  }

  inspectUrl() {
    const source = this.inspectorInput.trim() || window.location.href;
    const urlParts = this.extractUrlParts(source);
    const rawParams = this.getQueryParamRecord(urlParts.queryString);
    const compactParam = typeof rawParams.b === 'string' ? rawParams.b : undefined;
    const compactInspection = compactParam ? this.buildUrlCodec.inspect(compactParam) : undefined;
    const effectiveParams = this.getEffectiveParams(rawParams, compactInspection);

    this.inspectedUrlData = {
      source,
      route: urlParts.route,
      queryString: urlParts.queryString,
      rawParams,
      compactParam,
      compactInspection,
      effectiveParams
    };

    this.urlDataFormat = compactInspection ? compactInspection.format : 'legacy';
    this.effectiveParamCount = Object.keys(effectiveParams).length;
    this.payloadChars = compactInspection?.payloadChars ?? null;
    this.urlDataSummary = compactInspection?.error || `${this.effectiveParamCount} effective params`;
    this.refreshUrlInspectionJson();
  }

  setUrlInspectorView(view: UrlInspectorView) {
    this.urlInspectorView = view;
    this.refreshUrlInspectionJson();
  }

  private getPerformanceLogging() {
    try {
      return localStorage.getItem('ddoPerf') === '1';
    } catch {
      return false;
    }
  }

  private extractUrlParts(input: string) {
    let routeAndQuery = input;

    try {
      const parsedUrl = new URL(input, window.location.origin);
      if (parsedUrl.hash) {
        routeAndQuery = parsedUrl.hash.slice(1);
      } else if (parsedUrl.search) {
        routeAndQuery = parsedUrl.search;
      }
    } catch {
      routeAndQuery = input.startsWith('#') ? input.slice(1) : input;
    }

    const queryStart = routeAndQuery.indexOf('?');
    if (queryStart >= 0) {
      return {
        route: routeAndQuery.slice(0, queryStart) || '/',
        queryString: routeAndQuery.slice(queryStart + 1)
      };
    }

    const queryString = routeAndQuery.startsWith('?')
      ? routeAndQuery.slice(1)
      : (routeAndQuery.includes('=') ? routeAndQuery : '');

    return {
      route: queryString ? '/' : routeAndQuery || '/',
      queryString
    };
  }

  private getQueryParamRecord(queryString: string): UrlParamRecord {
    const params = new URLSearchParams(queryString);
    const record: UrlParamRecord = {};
    for (const key of Array.from(new Set(params.keys()))) {
      const values = params.getAll(key);
      record[key] = values.length > 1 ? values : (values[0] || '');
    }
    return record;
  }

  private getEffectiveParams(rawParams: UrlParamRecord, compactInspection?: BuildUrlInspection): UrlParamRecord {
    if (compactInspection?.format === 'compact' && compactInspection.decodedParams) {
      const passthroughParams = this.withoutCompactParam(rawParams);
      return {
        ...compactInspection.decodedParams,
        ...passthroughParams
      };
    }

    return this.withoutCompactParam(rawParams);
  }

  private withoutCompactParam(rawParams: UrlParamRecord): UrlParamRecord {
    const params: UrlParamRecord = {};
    for (const [key, value] of Object.entries(rawParams)) {
      if (key !== 'b') {
        params[key] = value;
      }
    }
    return params;
  }

  private refreshUrlInspectionJson() {
    if (!this.inspectedUrlData) {
      this.urlInspectionJson = '';
      return;
    }

    this.urlInspectionJson = JSON.stringify(this.getDisplayUrlData(this.inspectedUrlData), null, 2);
  }

  private getDisplayUrlData(data: UrlDataInspection): unknown {
    if (this.urlInspectorView === 'compact') {
      // Format and payload length are already shown in the stats boxes
      // above, so this view is just the decoded payload itself - or the
      // error, if there's no payload to show.
      return data.compactInspection?.compactPayload ?? data.compactInspection?.error ?? null;
    }

    if (this.urlInspectorView === 'effective') {
      return data.effectiveParams;
    }

    return this.getHumanReadableUrlData(data.effectiveParams);
  }

  private getHumanReadableUrlData(effectiveParams: UrlParamRecord): Partial<HumanReadableUrlData> {
    const humanData: HumanReadableUrlData = {
      filters: {},
      equipment: {},
      tracked: this.paramValueToArray(effectiveParams.tracked),
      nonGear: this.parseNonGearAffixes(effectiveParams.nongear),
      other: {}
    };
    const craftingBySlot = this.getCraftingBySlot(effectiveParams);

    for (const [key, value] of Object.entries(effectiveParams)) {
      if (FILTER_LABELS[key]) {
        humanData.filters[FILTER_LABELS[key]] = this.humanizeFilterValue(key, value);
      } else if (SLOT_ORDER.includes(key)) {
        humanData.equipment[key] = {
          item: this.firstParamValue(value)
        };
      } else if (key === 'tracked' || key === 'nongear' || key.startsWith('craft_') || key.startsWith('ml_')) {
        continue;
      } else {
        humanData.other[key] = value;
      }
    }

    for (const slot of SLOT_ORDER) {
      const item = humanData.equipment[slot];
      if (!item) {
        continue;
      }

      const minimumLevel = effectiveParams['ml_' + slot];
      if (minimumLevel !== undefined) {
        item.minimumLevel = this.firstParamValue(minimumLevel);
      }

      const crafting = craftingBySlot.get(slot);
      if (crafting?.length) {
        item.crafting = crafting;
      }
    }

    const result: Partial<HumanReadableUrlData> = {};
    if (Object.keys(humanData.filters).length) {
      result.filters = humanData.filters;
    }
    if (Object.keys(humanData.equipment).length) {
      result.equipment = humanData.equipment;
    }
    if (humanData.tracked.length) {
      result.tracked = humanData.tracked;
    }
    if (humanData.nonGear.length) {
      result.nonGear = humanData.nonGear;
    }
    if (Object.keys(humanData.other).length) {
      result.other = humanData.other;
    }
    return result;
  }

  private parseNonGearAffixes(value: string | string[] | undefined): HumanReadableUrlData['nonGear'] {
    if (value === undefined) {
      return [];
    }

    try {
      const parsed = JSON.parse(this.firstParamValue(value));
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((entry): entry is { affixName: string; bonusType: string; kind: string; value: number; label: string } =>
          !!entry && typeof entry.affixName === 'string')
        .map(entry => ({
          affix: entry.affixName,
          bonusType: entry.bonusType,
          kind: entry.kind,
          value: entry.value,
          label: entry.label
        }));
    } catch {
      return [];
    }
  }

  private getCraftingBySlot(effectiveParams: UrlParamRecord) {
    const craftingByIndex = new Map<number, { slot?: string; system?: string; selected?: string }>();
    for (const [key, value] of Object.entries(effectiveParams)) {
      const match = /^craft_(\d+)_(slot|system|selected)$/.exec(key);
      if (!match) {
        continue;
      }

      const index = Number(match[1]);
      const field = match[2] as 'slot' | 'system' | 'selected';
      const crafting = craftingByIndex.get(index) || {};
      crafting[field] = this.firstParamValue(value);
      craftingByIndex.set(index, crafting);
    }

    const craftingBySlot = new Map<string, Array<{ system: string; selected: string }>>();
    for (const index of Array.from(craftingByIndex.keys()).sort((left, right) => left - right)) {
      const crafting = craftingByIndex.get(index);
      if (!crafting?.slot || !crafting.system || !crafting.selected) {
        continue;
      }

      const slotCrafting = craftingBySlot.get(crafting.slot) || [];
      slotCrafting.push({
        system: crafting.system,
        selected: crafting.selected
      });
      craftingBySlot.set(crafting.slot, slotCrafting);
    }

    return craftingBySlot;
  }

  private humanizeFilterValue(key: string, value: string | string[]) {
    if (key === 'hiddentypes' || key === 'hiddenpacks') {
      return this.paramValueToArray(value).flatMap(entry => entry.split(',')).filter(entry => entry !== '');
    }

    if (key === 'levelrange') {
      const [minimum, maximum] = this.firstParamValue(value).split(',');
      return { minimum, maximum };
    }

    if (key === 'raids' || key === 'rare') {
      return this.firstParamValue(value) === 'true';
    }

    return value;
  }

  private firstParamValue(value: string | string[]) {
    return Array.isArray(value) ? value[0] || '' : value;
  }

  private paramValueToArray(value: string | string[] | undefined) {
    if (value === undefined) {
      return [];
    }

    return Array.isArray(value) ? value : [value];
  }
}
