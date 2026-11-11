import { ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnChanges, OnDestroy, Output, SimpleChanges } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  ApiTraceDTO, emptyTraceFilters, ExecutionPathRef, FilterState, TraceFilters, TraceListFilters, TraceSortField,
  TraceSortOrder
} from './rule-engine-monitoring.models';
import { RuleEngineHttpError, RuleEngineMonitoringWidgetService } from './rule-engine-monitoring.service';
import { TimeRangeChange, resolveRelativeRange } from './time-range-selector.component';
import { formatDuration } from './rule-engine-monitoring.utils';
import { PAGE_SIZE_OPTIONS } from './paginator.component';

interface ActiveChip {
  key: keyof TraceFilters;
  label: string;   // e.g. "Queue: Main"
}

type TraceSortColumn = 'ruleNodes' | 'startTime' | 'duration' | 'inQueueTime' | 'totalSpanTime';
type SortDirection = 'asc' | 'desc';
interface SortRule { field: TraceSortColumn; direction: SortDirection; }

const TRACE_SORT_FIELD_BY_COLUMN: Record<TraceSortColumn, TraceSortField> = {
  ruleNodes: 'RULE_NODE_COUNT',
  startTime: 'START_TIME',
  duration: 'DURATION',
  inQueueTime: 'IN_QUEUE_TIME',
  totalSpanTime: 'TOTAL_SPAN_TIME'
};

@Component({
  selector: 'tb-rem-traces',
  templateUrl: './traces.component.html',
  styleUrls: ['./traces.component.scss'],
  standalone: false,
})
export class TracesComponent implements OnChanges, OnDestroy {

  @Input() filterState: FilterState | null = null;
  @Input() injector: Injector | null = null;
  /** Execution-path filter applied from Path Details "View traces" (null when opened directly). */
  @Input() pathFilter: ExecutionPathRef | null = null;

  // Shared time-range picker state (owned by the parent tracing component, rendered in this view's toolbar).
  @Input() rangePreset = '24h';
  @Input() rangeCustomStart = '';
  @Input() rangeCustomEnd = '';
  @Output() rangeChange = new EventEmitter<TimeRangeChange>();

  /** Opens the shared Trace Details view for the given trace id. */
  @Output() openTrace = new EventEmitter<string>();
  /** User cleared the execution-path filter chip — let the container drop the path context. */
  @Output() clearPathFilter = new EventEmitter<void>();

  readonly columns = [
    'traceId', 'queue', 'messageType', 'ruleChain',
    'ruleNodes',
    'startTime', 'duration', 'inQueueTime', 'totalSpanTime',
    'withTimeout', 'withErrors'
  ];
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  page = 0;
  pageSize = PAGE_SIZE_OPTIONS[0];
  traceSort: SortRule[] = [];

  readonly fmtTime = (ts: number | null | undefined): string => ts ? new Date(ts).toLocaleString() : '—';
  readonly fmtDuration = (ms: number | null | undefined): string => ms == null ? '—' : formatDuration(ms);

  filters: TraceFilters = emptyTraceFilters();
  draftFilters: TraceFilters = emptyTraceFilters();

  loading = false;
  errorMessage: string | null = null;

  // option lists for the searchable dropdowns, loaded from GET /api/traces/filters
  ruleEngineOptions: string[] = [];
  queueOptions: string[] = [];
  ruleChainOptions: string[] = [];
  ruleNodeOptions: string[] = [];
  messageTypeOptions: string[] = [];

  // in-panel search terms per dropdown
  ruleEngineSearch = '';
  queueSearch = '';
  ruleChainSearch = '';
  ruleNodeSearch = '';
  messageTypeSearch = '';

  rows: ApiTraceDTO[] = [];
  serverTotal = 0;
  copiedTraceId: string | null = null;

  private service: RuleEngineMonitoringWidgetService | null = null;
  private sub?: Subscription;
  private filtersSub?: Subscription;
  private copiedResetTimer: ReturnType<typeof setTimeout> | null = null;
  private ruleChainNameToId = new Map<string, string>();
  private ruleChainIdToName = new Map<string, string>();
  private ruleNodeNameToId = new Map<string, string>();

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (this.injector && !this.service) {
      this.service = new RuleEngineMonitoringWidgetService(this.injector);
      this.loadFilterOptions();
    }
    if (changes['pathFilter']) {
      // path filter is owned by the container; reflect it into the local filter model
      if (this.pathFilter?.pathId) {
        // fresh drill-down — open the Traces view showing only the path filter (clear any stale filters)
        this.filters = { ...emptyTraceFilters(), pathId: this.pathFilter.pathId };
      } else {
        // path filter cleared by the container — drop only pathId, keep the user's other filters
        this.filters = { ...this.filters, pathId: null };
      }
      this.draftFilters = this.cloneFilters(this.filters);
    }
    if (changes['filterState'] && this.filterState) {
      this.page = 0;
      this.load();
    } else if (changes['pathFilter']) {
      this.applyFilters();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.filtersSub?.unsubscribe();
    if (this.copiedResetTimer) {
      clearTimeout(this.copiedResetTimer);
    }
  }

  reload(): void {
    this.load();
  }

  /** Loads the filter dropdown options from GET /api/traces/filters (current entities + known message types). */
  private loadFilterOptions(): void {
    if (!this.service) { return; }
    this.filtersSub?.unsubscribe();
    this.filtersSub = this.service.getTraceFilters().subscribe({
      next: (f: TraceListFilters) => {
        this.ruleChainNameToId.clear();
        this.ruleChainIdToName.clear();
        this.ruleNodeNameToId.clear();
        (f.ruleChains ?? []).forEach(c => {
          this.ruleChainNameToId.set(c.name, c.id);
          this.ruleChainIdToName.set(c.id, c.name);
        });
        (f.ruleNodes ?? []).forEach(n => this.ruleNodeNameToId.set(n.name, n.id));
        this.ruleEngineOptions = this.distinct(f.ruleEngines ?? []);
        this.queueOptions = this.distinct((f.queues ?? []).map(q => q.name));
        this.ruleChainOptions = this.distinct((f.ruleChains ?? []).map(c => c.name));
        this.ruleNodeOptions = this.distinct((f.ruleNodes ?? []).map(n => n.name));
        this.messageTypeOptions = this.distinct(f.messageTypes ?? []);
        this.cdr.detectChanges();
      },
      error: () => { /* leave dropdowns empty on failure; the trace list still loads */ }
    });
  }

  /** filterState with the time window recomputed to now for relative presets (so refresh/fetch always uses
   *  the current time); custom ranges keep their explicitly picked window. */
  private effectiveFilterState(): FilterState | null {
    if (!this.filterState) { return null; }
    const r = resolveRelativeRange(this.rangePreset);
    return r ? { ...this.filterState, startTs: r.startTs, endTs: r.endTs } : this.filterState;
  }

  private load(): void {
    if (!this.service || !this.filterState) { return; }
    this.loading = true;
    this.errorMessage = null;
    this.sub?.unsubscribe();
    const primary = this.traceSort.length ? this.traceSort[0] : null;
    const sortBy: TraceSortField = primary ? TRACE_SORT_FIELD_BY_COLUMN[primary.field] : 'START_TIME';
    const sortOrder: TraceSortOrder = primary ? (primary.direction === 'asc' ? 'ASC' : 'DESC') : 'DESC';
    this.sub = this.service.getTraces(this.effectiveFilterState()!, this.filters, this.page, this.pageSize,
      this.ruleChainNameToId, this.ruleNodeNameToId,
      sortBy, sortOrder).subscribe({
      next: pageData => {
        this.rows = pageData.data ?? [];
        this.serverTotal = pageData.totalElements ?? this.rows.length;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: RuleEngineHttpError) => {
        this.loading = false;
        this.errorMessage = err?.status === 401 || err?.status === 403
          ? 'Access denied. Please log in with sufficient permissions.'
          : 'Failed to load traces.';
        this.cdr.detectChanges();
      }
    });
  }

  private distinct(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }

  /** Re-query the server with the current filters. */
  applyFilters(): void {
    this.page = 0;
    this.load();
  }

  onFilterMenuOpen(): void {
    this.draftFilters = this.cloneFilters(this.filters);
  }

  applyDraftFilters(trigger?: { closeMenu: () => void }): void {
    if (!this.hasDraftChanges) {
      return;
    }
    this.filters = this.cloneFilters(this.draftFilters);
    trigger?.closeMenu();
    this.applyFilters();
  }

  cancelDraftFilters(trigger?: { closeMenu: () => void }): void {
    this.draftFilters = this.cloneFilters(this.filters);
    trigger?.closeMenu();
  }

  private cloneFilters(filters: TraceFilters): TraceFilters {
    return { ...filters };
  }

  private filtersEqual(a: TraceFilters, b: TraceFilters): boolean {
    return a.traceId === b.traceId
      && a.ruleEngine === b.ruleEngine
      && a.queue === b.queue
      && a.ruleChain === b.ruleChain
      && a.ruleNode === b.ruleNode
      && a.messageType === b.messageType
      && a.messageId === b.messageId
      && a.originator === b.originator
      && a.messageData === b.messageData
      && a.messageMetadata === b.messageMetadata
      && a.withTimeout === b.withTimeout
      && a.withError === b.withError
      && a.pathId === b.pathId;
  }

  get hasDraftChanges(): boolean {
    return !this.filtersEqual(this.filters, this.draftFilters);
  }

  // Searchable-dropdown option lists, filtered by the in-panel search term.
  private searchOpts(opts: string[], term: string): string[] {
    const t = term.trim().toLowerCase();
    return t ? opts.filter(o => o.toLowerCase().includes(t)) : opts;
  }
  get filteredRuleEngines(): string[] { return this.searchOpts(this.ruleEngineOptions, this.ruleEngineSearch); }
  get filteredQueues(): string[] { return this.searchOpts(this.queueOptions, this.queueSearch); }
  get filteredRuleChains(): string[] { return this.searchOpts(this.ruleChainOptions, this.ruleChainSearch); }
  get filteredRuleNodes(): string[] { return this.searchOpts(this.ruleNodeOptions, this.ruleNodeSearch); }
  get filteredMessageTypes(): string[] { return this.searchOpts(this.messageTypeOptions, this.messageTypeSearch); }

  get total(): number {
    return this.serverTotal;
  }

  /** Server already returned only the requested page. */
  get pagedRows(): ApiTraceDTO[] {
    return this.rows;
  }

  onPageChange(page: number): void {
    this.page = page;
    this.load();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.page = 0;
    this.load();
  }

  onSort(column: TraceSortColumn): void {
    this.traceSort = this.toggleRule(this.traceSort, column);
    this.page = 0;
    this.load();
  }

  sortRule(column: TraceSortColumn): { priority: number; direction: SortDirection } | null {
    return this.ruleOf(this.traceSort, column);
  }

  clearSort(): void {
    this.traceSort = [];
    this.page = 0;
    this.load();
  }

  private toggleRule(rules: SortRule[], field: TraceSortColumn): SortRule[] {
    const idx = rules.findIndex(r => r.field === field);
    if (idx < 0) {
      return [...rules, { field, direction: 'asc' }];
    }
    if (rules[idx].direction === 'asc') {
      const next = [...rules];
      next[idx] = { field, direction: 'desc' };
      return next;
    }
    return rules.filter((_, i) => i !== idx);
  }

  private ruleOf(rules: SortRule[], field: TraceSortColumn): { priority: number; direction: SortDirection } | null {
    const idx = rules.findIndex(r => r.field === field);
    return idx < 0 ? null : { priority: idx + 1, direction: rules[idx].direction };
  }

  copyTraceId(traceId: string, event: MouseEvent): void {
    event.stopPropagation();
    navigator.clipboard?.writeText(traceId);
    this.copiedTraceId = traceId;
    if (this.copiedResetTimer) {
      clearTimeout(this.copiedResetTimer);
    }
    this.copiedResetTimer = setTimeout(() => {
      this.copiedTraceId = null;
      this.copiedResetTimer = null;
      this.cdr.markForCheck();
    }, 1200);
  }

  /** Chips shown above the table for every active filter. */
  get activeChips(): ActiveChip[] {
    const f = this.filters;
    const chips: ActiveChip[] = [];
    if (f.traceId) { chips.push({ key: 'traceId', label: `Trace id: ${f.traceId}` }); }
    if (f.ruleEngine) { chips.push({ key: 'ruleEngine', label: `Rule engine: ${f.ruleEngine}` }); }
    if (f.queue) { chips.push({ key: 'queue', label: `Queue: ${f.queue}` }); }
    if (f.ruleChain) { chips.push({ key: 'ruleChain', label: `Rule chain: ${f.ruleChain}` }); }
    if (f.ruleNode) { chips.push({ key: 'ruleNode', label: `Rule node: ${f.ruleNode}` }); }
    if (f.messageType) { chips.push({ key: 'messageType', label: `Message type: ${f.messageType}` }); }
    if (f.messageId) { chips.push({ key: 'messageId', label: `Message id: ${f.messageId}` }); }
    if (f.originator) { chips.push({ key: 'originator', label: `Originator: ${f.originator}` }); }
    if (f.messageData) { chips.push({ key: 'messageData', label: `Message data: ${f.messageData}` }); }
    if (f.messageMetadata) { chips.push({ key: 'messageMetadata', label: `Message metadata: ${f.messageMetadata}` }); }
    if (f.withTimeout) { chips.push({ key: 'withTimeout', label: 'With timeout' }); }
    if (f.withError) { chips.push({ key: 'withError', label: 'With error' }); }
    if (f.pathId) { chips.push({ key: 'pathId', label: `Group ID: ${f.pathId}` }); }
    return chips;
  }

  get hasActiveFilters(): boolean {
    return this.activeChips.length > 0;
  }

  get activeFilterCount(): number {
    return this.activeChips.length;
  }

  removeChip(key: keyof TraceFilters): void {
    if (key === 'pathId') {
      this.clearPathFilter.emit();
    }
    const reset = (key === 'withTimeout' || key === 'withError') ? false : null;
    this.filters = { ...this.filters, [key]: reset };
    this.draftFilters = this.cloneFilters(this.filters);
    this.applyFilters();
  }

  clearAll(): void {
    if (this.filters.pathId) {
      this.clearPathFilter.emit();
    }
    this.filters = emptyTraceFilters();
    this.draftFilters = emptyTraceFilters();
    this.ruleEngineSearch = this.queueSearch = this.ruleChainSearch = this.ruleNodeSearch = this.messageTypeSearch = '';
    this.applyFilters();
  }

  onRowClick(t: ApiTraceDTO): void {
    this.openTrace.emit(t.traceId);
  }

  trackByTrace(_: number, t: ApiTraceDTO): string {
    return t.traceId;
  }

  rootRuleChainName(t: ApiTraceDTO): string {
    if (!t.rootRuleChainId) {
      return '—';
    }
    return this.ruleChainIdToName.get(t.rootRuleChainId) ?? t.rootRuleChainId;
  }
}
