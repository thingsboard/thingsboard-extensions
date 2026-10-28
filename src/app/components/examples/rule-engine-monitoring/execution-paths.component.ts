import {
  ChangeDetectorRef, Component, EventEmitter, Injector, Input, OnChanges, OnDestroy, Output, SimpleChanges
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  ExecutionPathRef, FilterState, PathListItem, PathSortField, PathSortOrder,
  RuleNodeTreeNode, TracePathDetails, TraceRuleNodeMetric, TraceSpan
} from './rule-engine-monitoring.models';
import { RuleEngineMonitoringWidgetService, RuleEngineHttpError } from './rule-engine-monitoring.service';
import { TimeRangeChange, resolveRelativeRange } from './time-range-selector.component';
import { formatAvgDuration, formatDuration, formatPercent, formatRelativeTime, shortNodeType } from './rule-engine-monitoring.utils';
import { PAGE_SIZE_OPTIONS } from './paginator.component';

// ── Sort model ──────────────────────────────────────────────────────────────
// The main table sorts server-side: the highest-priority column drives the list endpoint's sortBy/sortOrder.
// The (in-memory) rule node table keeps the multi-column client sort.
type SortDirection = 'asc' | 'desc';
interface SortRule { field: string; direction: SortDirection; }

// ── View models ───────────────────────────────────────────────────────────────

interface PathRow {
  pathId: string;
  name: string;
  messageType: string;
  queueName: string;
  ruleChainName: string;

  // formatted display values
  traceCountDisplay: string;
  storedTraceCountDisplay: string;
  successRateDisplay: string;
  failedDisplay: string;
  timeoutDisplay: string;
  errorRateDisplay: string;
  timeoutRateDisplay: string;
  avgDisplay: string;
  avgInQueueDisplay: string;
  avgRuleNodeProcessingDisplay: string;
  maxDisplay: string;
  p95Display: string;
  totalDisplay: string;

  // structural / observation values (also used for the sort badges)
  traceCount: number;             // processed traces aggregated for the path
  storedTraceCount: number;       // traces stored (sampled, with persisted spans) for drill-down
  lastObservedTs: number;         // latest sampled-trace time (0 = none)
  lastObservedDisplay: string;    // relative, e.g. "2 min ago"
  lastObservedExact: string;      // tooltip — exact timestamp

  // workload values — populated from the path details endpoint when a path is opened
  successRate: number;
  failedTraces: number;
  timeoutTraces: number;
  avgDuration: number;
  avgInQueueDuration: number;
  avgRuleNodeProcessingDuration: number;
  maxDuration: number;
  totalDuration: number;
  totalInQueueTime: number;
  totalRuleNodeProcessingTime: number;

  graphRoots: TraceSpan[];
  nodeMetrics: TraceRuleNodeMetric[];
}

// Maps a main-table column key to the list endpoint's sort field.
const SORT_FIELD_BY_COLUMN: Record<string, PathSortField> = {
  queue:        'ROOT_QUEUE',
  messageType:  'ROOT_MESSAGE_TYPE',
  ruleChain:    'ROOT_RULE_CHAIN',
  lastObserved: 'LAST_OBSERVED',
  traceCount:   'TRACES_COUNT',
  storedTraces: 'STORED_TRACES',
  timeoutTraces: 'TIMEOUT_TRACES',
  errorTraces:   'ERROR_TRACES',
  avgTime:      'AVG_TIME',
  avgInQueueTime: 'AVG_IN_QUEUE_TIME',
  avgRuleNodeProcessingTime: 'AVG_RULE_NODE_PROCESSING_TIME',
  maxTime:      'MAX_TIME',
};

@Component({
  selector: 'tb-rem-execution-paths',
  templateUrl: './execution-paths.component.html',
  styleUrls: ['./execution-paths.component.scss'],
  standalone: false,
})
export class ExecutionPathsComponent implements OnChanges, OnDestroy {

  @Input() filterState: FilterState | null = null;
  @Input() injector:    Injector    | null = null;

  // Shared time-range picker state (owned by the parent tracing component, rendered in this view's toolbar).
  @Input() rangePreset = '24h';
  @Input() rangeCustomStart = '';
  @Input() rangeCustomEnd = '';
  @Output() rangeChange = new EventEmitter<TimeRangeChange>();

  /** Emitted when the user clicks "View traces" in Path Details — the container switches to the
   *  global Traces view filtered to this execution path. */
  @Output() viewTraces = new EventEmitter<ExecutionPathRef>();

  // the path opened in the focused Path Details view (null → table mode)
  selectedPath: PathRow | null = null;

  rows: PathRow[] = [];
  loading = false;
  errorMessage: string | null = null;

  // per-table multi-column sort state (main table collapses to its primary column for the server call)
  mainSort: SortRule[] = [];
  nodeSort: SortRule[] = [];

  // pagination (paths table) — server-side: `rows` already holds the requested page
  readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  page = 0;
  pageSize = PAGE_SIZE_OPTIONS[0];

  // entry-point filters (root queue / message type / rule chain), AND-combined, applied server-side
  queueFilter: string | null = null;
  messageTypeFilter: string | null = null;
  ruleChainFilter: string | null = null;

  queueOptions: string[] = [];
  messageTypeOptions: string[] = [];
  ruleChainOptions: string[] = [];

  queueSearch = '';
  messageTypeSearch = '';
  ruleChainSearch = '';

  // mirror of `rows`, kept so the template's empty-state check (`filtered.length === 0`) still works
  filtered: PathRow[] = [];

  readonly displayedColumns = [
    'pathId', 'queue', 'messageType', 'ruleChain',
    'lastObserved', 'traceCount', 'storedTraces', 'timeoutTraces', 'errorTraces',
    'avgTime', 'avgInQueueTime', 'avgRuleNodeProcessingTime', 'maxTime', 'spacer'
  ];

  // path id whose copy icon was just clicked — briefly swaps the icon to a check as feedback
  copiedPathId: string | null = null;
  private copiedResetTimer: ReturnType<typeof setTimeout> | null = null;

  readonly nodeColumns = [
    'ruleChain', 'name', 'totalDuration', 'execCount', 'avgDuration', 'failedCount'
  ];

  readonly fmtTime = (ts: number): string => new Date(ts).toLocaleString();

  // exposed to template
  readonly fmtDuration = formatDuration;
  readonly fmtAvg = formatAvgDuration;
  private service: RuleEngineMonitoringWidgetService | null = null;
  private sub: Subscription | null = null;
  private filtersSub: Subscription | null = null;
  private detailsSub: Subscription | null = null;
  // selected-name → id, used to translate the entry-point filters into the list endpoint's id params
  private queueNameToId = new Map<string, string>();
  private ruleChainNameToId = new Map<string, string>();
  // total element count reported by the server for the current query
  private serverTotal = 0;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['injector'] && this.injector && !this.service) {
      this.service = new RuleEngineMonitoringWidgetService(this.injector);
    }
    if (changes['filterState'] && this.filterState && this.service) {
      this.loadFilterOptions();   // task 1: refresh filter dropdowns for the new time range
      this.page = 0;
      this.fetch();               // task 2: load the first page
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.filtersSub?.unsubscribe();
    this.detailsSub?.unsubscribe();
    if (this.copiedResetTimer) { clearTimeout(this.copiedResetTimer); }
  }

  /** Copies the full path id to the clipboard, briefly flagging the row so its icon shows a check. */
  copyPathId(pathId: string, event: MouseEvent): void {
    event.stopPropagation();   // don't open the path details row
    navigator.clipboard?.writeText(pathId);
    this.copiedPathId = pathId;
    if (this.copiedResetTimer) { clearTimeout(this.copiedResetTimer); }
    this.copiedResetTimer = setTimeout(() => {
      this.copiedPathId = null;
      this.copiedResetTimer = null;
      this.cdr.markForCheck();
    }, 1200);
  }

  /** Manual reload of the execution paths. */
  reload(): void {
    if (!this.service || !this.filterState) { return; }
    this.loadFilterOptions();
    this.fetch();
  }

  /** Blocking spinner only on the very first load; later refreshes update in place. */
  get initialLoading(): boolean {
    return this.loading && this.rows.length === 0;
  }

  get total(): number {
    return this.serverTotal;
  }

  /** Server already returned just the requested page. */
  get pagedRows(): PathRow[] {
    return this.rows;
  }

  // ── Filters (task 1 + server-side filtering) ────────────────────────────────

  /** Loads the consolidated filter dropdown options from the backend for the current time range. */
  /** filterState with the time window recomputed to now for relative presets (so refresh/fetch always uses
   *  the current time); custom ranges keep their explicitly picked window. */
  private effectiveFilterState(): FilterState | null {
    if (!this.filterState) { return null; }
    const r = resolveRelativeRange(this.rangePreset);
    return r ? { ...this.filterState, startTs: r.startTs, endTs: r.endTs } : this.filterState;
  }

  private loadFilterOptions(): void {
    if (!this.service || !this.filterState) { return; }
    this.filtersSub?.unsubscribe();
    this.filtersSub = this.service.getPathFilters(this.effectiveFilterState()!).subscribe({
      next: f => {
        this.queueNameToId.clear();
        this.ruleChainNameToId.clear();
        (f.queues ?? []).forEach(q => this.queueNameToId.set(q.name, q.id));
        (f.ruleChains ?? []).forEach(c => this.ruleChainNameToId.set(c.name, c.id));
        this.queueOptions = this.distinct((f.queues ?? []).map(q => q.name));
        this.ruleChainOptions = this.distinct((f.ruleChains ?? []).map(c => c.name));
        const types = [...(f.messageTypes ?? [])];
        // keep a selected custom message type available even if the server didn't return it
        if (this.messageTypeFilter && !types.includes(this.messageTypeFilter)) {
          types.push(this.messageTypeFilter);
        }
        this.messageTypeOptions = this.distinct(types);
        this.cdr.detectChanges();
      },
      error: () => { /* leave dropdowns empty on failure; the list call surfaces the error */ }
    });
  }

  /** Re-query the list with the current entry-point filters. Resets to the first page. */
  applyFilters(): void {
    this.page = 0;
    this.fetch();
  }

  private distinct(values: string[]): string[] {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
  }

  private searchOpts(opts: string[], term: string): string[] {
    const t = term.trim().toLowerCase();
    return t ? opts.filter(o => o.toLowerCase().includes(t)) : opts;
  }
  get filteredQueues(): string[] { return this.searchOpts(this.queueOptions, this.queueSearch); }
  get filteredRuleChains(): string[] { return this.searchOpts(this.ruleChainOptions, this.ruleChainSearch); }
  get filteredMessageTypes(): string[] { return this.searchOpts(this.messageTypeOptions, this.messageTypeSearch); }

  /** A custom message type can be added when the search term is non-empty and not already an option. */
  canAddMessageType(): boolean {
    const t = this.messageTypeSearch.trim();
    return !!t && !this.messageTypeOptions.some(o => o.toLowerCase() === t.toLowerCase());
  }

  addCustomMessageType(): void {
    const t = this.messageTypeSearch.trim();
    if (!t) { return; }
    if (!this.messageTypeOptions.includes(t)) {
      this.messageTypeOptions = this.distinct([...this.messageTypeOptions, t]);
    }
    this.messageTypeFilter = t;     // exact-match filter on the custom value
    this.messageTypeSearch = '';
    this.applyFilters();
  }

  get hasActiveFilters(): boolean {
    return !!(this.queueFilter || this.messageTypeFilter || this.ruleChainFilter);
  }

  clearFilters(): void {
    this.queueFilter = null;
    this.messageTypeFilter = null;
    this.ruleChainFilter = null;
    this.queueSearch = this.messageTypeSearch = this.ruleChainSearch = '';
    this.applyFilters();
  }

  // ── Pagination (task 2) ──────────────────────────────────────────────────────

  onPageChange(page: number): void {
    this.page = page;
    this.fetch();
  }

  onPageSizeChange(size: number): void {
    this.pageSize = size;
    this.page = 0;
    this.fetch();
  }

  trackByRow(_: number, row: PathRow): string {
    return row.pathId;
  }

  trackByNode(_: number, node: TraceRuleNodeMetric): string {
    return node.ruleNodeId;
  }

  // ── Drill-down (task 4) ──────────────────────────────────────────────────────

  /** Open the focused Path Details view for a path and load its rule node tree from the backend. */
  openPath(row: PathRow): void {
    this.selectedPath = row;
    this.nodeSort = [];
    this.errorMessage = null;
    this.cdr.detectChanges();
    if (!this.service || !this.filterState) { return; }
    this.detailsSub?.unsubscribe();
    this.detailsSub = this.service.getPathDetails(row.pathId, this.effectiveFilterState()!).subscribe({
      next: details => {
        this.applyDetails(row, details);
        this.cdr.detectChanges();
      },
      error: (err: RuleEngineHttpError) => {
        this.errorMessage = err?.status === 401 || err?.status === 403
          ? 'Access denied. Please log in with sufficient permissions.'
          : 'Failed to load path details.';
        this.cdr.detectChanges();
      }
    });
  }

  /** Return to the table. */
  backToPaths(): void {
    this.selectedPath = null;
    this.nodeSort = [];
    this.cdr.detectChanges();
  }

  /** "View traces" → ask the container to open the global Traces view filtered to this path. */
  onViewTraces(row: PathRow): void {
    this.viewTraces.emit({
      pathId: row.pathId,
      label: `${row.queueName} / ${row.messageType} / ${row.ruleChainName}`,
    });
  }

  // ── Sorting ───────────────────────────────────────────────────────────────

  // Main paths table (task 3): the primary column drives the server sort.
  onMainSort(field: string): void {
    this.mainSort = this.toggleRule(this.mainSort, field);
    this.page = 0;
    this.fetch();
  }
  mainSortRule(field: string): { priority: number; direction: SortDirection } | null {
    return this.ruleOf(this.mainSort, field);
  }
  clearMainSort(): void {
    this.mainSort = [];
    this.page = 0;
    this.fetch();
  }

  // Rule node metrics table (within the selected path) — sorted client-side over the loaded tree.
  onNodeSort(path: PathRow, field: string): void {
    this.nodeSort = this.toggleRule(this.nodeSort, field);
    path.nodeMetrics = this.applyRules(path.nodeMetrics, this.nodeSort, (n, f) => this.nodeVal(n, f));
    this.cdr.detectChanges();
  }
  nodeSortRule(field: string): { priority: number; direction: SortDirection } | null {
    return this.ruleOf(this.nodeSort, field);
  }
  clearNodeSort(path: PathRow): void {
    this.nodeSort = [];
    this.cdr.detectChanges();
  }
  private nodeVal(n: TraceRuleNodeMetric, f: string): string | number | null {
    switch (f) {
      case 'ruleChain':     return n.ruleChainName ?? '';
      case 'name':          return n.ruleNodeName;
      case 'totalDuration': return n.totalDurationMs;
      case 'execCount':     return n.executionCount;
      case 'avgDuration':   return n.avgDurationMs;
      case 'failedCount':   return n.failedExecutionCount;
      default:              return null;
    }
  }

  /** asc → desc → off cycle for a column, preserving click order (priority). */
  private toggleRule(rules: SortRule[], field: string): SortRule[] {
    const idx = rules.findIndex(r => r.field === field);
    if (idx < 0) { return [...rules, { field, direction: 'asc' }]; }
    if (rules[idx].direction === 'asc') {
      const next = [...rules];
      next[idx] = { field, direction: 'desc' };
      return next;
    }
    return rules.filter((_, i) => i !== idx);
  }

  private ruleOf(rules: SortRule[], field: string): { priority: number; direction: SortDirection } | null {
    const idx = rules.findIndex(r => r.field === field);
    return idx < 0 ? null : { priority: idx + 1, direction: rules[idx].direction };
  }

  private applyRules<T>(items: T[], rules: SortRule[], val: (item: T, field: string) => string | number | null): T[] {
    if (!rules.length) { return items; }
    return [...items].sort((a, b) => {
      for (const r of rules) {
        const va = val(a, r.field);
        const vb = val(b, r.field);
        if (va === null && vb === null) { continue; }
        if (va === null) { return 1; }
        if (vb === null) { return -1; }
        const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
        if (cmp !== 0) { return r.direction === 'asc' ? cmp : -cmp; }
      }
      return 0;
    });
  }

  // ── Data loading (tasks 2 & 3) ───────────────────────────────────────────────

  private fetch(): void {
    if (!this.service || !this.filterState) { return; }
    this.sub?.unsubscribe();
    this.errorMessage = null;
    this.loading = true;
    this.cdr.detectChanges();

    const primary = this.mainSort.length ? this.mainSort[0] : null;
    const sortBy: PathSortField = primary ? (SORT_FIELD_BY_COLUMN[primary.field] ?? 'LAST_OBSERVED') : 'LAST_OBSERVED';
    const sortOrder: PathSortOrder = primary ? (primary.direction === 'asc' ? 'ASC' : 'DESC') : 'DESC';

    this.sub = this.service.getPaths(this.effectiveFilterState()!, {
      page: this.page,
      pageSize: this.pageSize,
      sortBy,
      sortOrder,
      rootQueueId: this.queueFilter ? this.queueNameToId.get(this.queueFilter) ?? null : null,
      rootMessageType: this.messageTypeFilter,
      rootRuleChainId: this.ruleChainFilter ? this.ruleChainNameToId.get(this.ruleChainFilter) ?? null : null,
    }).subscribe({
      next: res => {
        this.rows = (res.data ?? []).map(p => this.buildRow(p));
        this.filtered = this.rows;
        this.serverTotal = res.totalElements ?? this.rows.length;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: RuleEngineHttpError) => {
        this.loading = false;
        this.errorMessage = err?.status === 401 || err?.status === 403
          ? 'Access denied. Please log in with sufficient permissions.'
          : 'Failed to load trace groups.';
        this.cdr.detectChanges();
      }
    });
  }

  private buildRow(p: PathListItem): PathRow {
    const now = this.filterState?.endTs ?? Date.now();
    const lastObservedTs = p.lastObserved ?? 0;
    const queueName = p.rootQueueName ?? '—';
    const messageType = p.rootMessageType ?? '—';
    const ruleChainName = p.rootRuleChainName ?? 'Unknown Rule Chain';

    return {
      pathId: p.pathId,
      name: `${queueName} / ${messageType} / ${ruleChainName}`,
      messageType,
      queueName,
      ruleChainName,

      traceCountDisplay: (p.processedTraces ?? 0).toLocaleString(),
      storedTraceCountDisplay: (p.storedTraces ?? 0).toLocaleString(),
      // workload metrics are only known once the path is opened (details endpoint) — placeholders here
      successRateDisplay: '—',
      failedDisplay: (p.processedTracesWithError ?? 0).toLocaleString(),
      timeoutDisplay: (p.processedTracesWithTimeout ?? 0).toLocaleString(),
      errorRateDisplay: this.formatAffectedRate(p.processedTracesWithError ?? 0, p.processedTraces ?? 0),
      timeoutRateDisplay: this.formatAffectedRate(p.processedTracesWithTimeout ?? 0, p.processedTraces ?? 0),
      avgDisplay: p.processedTraces ? formatAvgDuration((p.totalTime ?? 0) / p.processedTraces) : '—',
      avgInQueueDisplay: p.processedTraces ? formatAvgDuration((p.totalInQueueTime ?? 0) / p.processedTraces) : '—',
      avgRuleNodeProcessingDisplay: p.processedTraces ? formatAvgDuration((p.totalRuleNodeProcessingTime ?? 0) / p.processedTraces) : '—',
      maxDisplay: p.maxTime ? formatDuration(p.maxTime) : '—',
      p95Display: '—',
      totalDisplay: '—',

      traceCount: p.processedTraces ?? 0,
      storedTraceCount: p.storedTraces ?? 0,
      lastObservedTs,
      lastObservedDisplay: formatRelativeTime(lastObservedTs, now),
      lastObservedExact: lastObservedTs ? new Date(lastObservedTs).toLocaleString() : '—',

      successRate: 0,
      failedTraces: p.processedTracesWithError ?? 0,
      timeoutTraces: p.processedTracesWithTimeout ?? 0,
      avgDuration: p.processedTraces ? (p.totalTime ?? 0) / p.processedTraces : 0,
      avgInQueueDuration: p.processedTraces ? (p.totalInQueueTime ?? 0) / p.processedTraces : 0,
      avgRuleNodeProcessingDuration: p.processedTraces ? (p.totalRuleNodeProcessingTime ?? 0) / p.processedTraces : 0,
      maxDuration: p.maxTime ?? 0,
      totalDuration: p.totalTime ?? 0,
      totalInQueueTime: p.totalInQueueTime ?? 0,
      totalRuleNodeProcessingTime: p.totalRuleNodeProcessingTime ?? 0,

      graphRoots: [],
      nodeMetrics: [],
    };
  }

  /** Overlays the loaded rule node tree (and the metrics derived from it) onto the opened row. */
  private applyDetails(row: PathRow, details: TracePathDetails): void {
    const tree = details.ruleNodeTree ?? [];
    row.graphRoots = this.mapTreeToSpans(tree);
    row.nodeMetrics = this.flattenTree(tree);

    const totalCount = row.nodeMetrics.reduce((sum, n) => sum + (n.executionCount ?? 0), 0);
    const errors = row.nodeMetrics.reduce((sum, n) => sum + (n.failedExecutionCount ?? 0), 0);
    const processedTraces = details.processedTraces ?? row.traceCount;
    const totalDuration = details.totalTime ?? row.totalDuration;
    const maxDuration = details.maxTime ?? row.maxDuration;
    const totalInQueueTime = details.totalInQueueTime ?? row.totalInQueueTime;
    const totalRuleNodeProcessingTime = details.totalRuleNodeProcessingTime ?? row.totalRuleNodeProcessingTime;

    row.totalDuration = totalDuration;
    row.avgDuration = processedTraces > 0 ? totalDuration / processedTraces : 0;
    row.maxDuration = maxDuration;
    row.totalInQueueTime = totalInQueueTime;
    row.totalRuleNodeProcessingTime = totalRuleNodeProcessingTime;
    row.avgInQueueDuration = processedTraces > 0 ? totalInQueueTime / processedTraces : 0;
    row.avgRuleNodeProcessingDuration = processedTraces > 0 ? totalRuleNodeProcessingTime / processedTraces : 0;
    row.successRate = totalCount > 0 ? (totalCount - errors) / totalCount : 0;
    row.failedTraces = details.processedTracesWithError ?? row.failedTraces;
    row.timeoutTraces = details.processedTracesWithTimeout ?? row.timeoutTraces;

    row.totalDisplay = totalDuration ? formatDuration(totalDuration) : '—';
    row.avgDisplay = processedTraces > 0 ? formatAvgDuration(row.avgDuration) : '—';
    row.avgInQueueDisplay = processedTraces > 0 ? formatAvgDuration(row.avgInQueueDuration) : '—';
    row.avgRuleNodeProcessingDisplay = processedTraces > 0 ? formatAvgDuration(row.avgRuleNodeProcessingDuration) : '—';
    row.maxDisplay = maxDuration ? formatDuration(maxDuration) : '—';
    row.successRateDisplay = totalCount > 0 ? formatPercent(row.successRate) : '—';
    row.failedDisplay = (row.failedTraces ?? 0).toLocaleString();
    row.timeoutDisplay = (row.timeoutTraces ?? 0).toLocaleString();
    row.errorRateDisplay = this.formatAffectedRate(row.failedTraces, processedTraces);
    row.timeoutRateDisplay = this.formatAffectedRate(row.timeoutTraces, processedTraces);
  }

  private formatAffectedRate(affected: number, processed: number): string {
    const safeAffected = Math.max(0, affected ?? 0);
    const safeProcessed = Math.max(0, processed ?? 0);
    const percentage = safeProcessed > 0 ? (safeAffected / safeProcessed) * 100 : 0;
    const percentageDisplay = Number.isInteger(percentage) ? `${percentage}%` : `${percentage.toFixed(1)}%`;
    return `${safeAffected.toLocaleString()} / ${safeProcessed.toLocaleString()} (${percentageDisplay})`;
  }

  /** Recursively maps the rule node tree into the graph-tree span model used by the details template. */
  private mapTreeToSpans(nodes: RuleNodeTreeNode[]): TraceSpan[] {
    return nodes.map(n => ({
      spanId: n.ruleNodeId,
      name: n.ruleNodeName,
      type: shortNodeType(n.ruleNodeType),
      ruleChain: n.ruleChainName ?? '',
      queueName: n.queueName,
      serviceId: '',
      relation: n.relation,
      startMs: 0,
      durationMs: n.totalTime ?? 0,
      error: (n.errors ?? 0) > 0,
      children: this.mapTreeToSpans(n.children ?? []),
    }));
  }

  /** Flattens the rule node tree (pre-order) into the per-node metrics rows for the node table. */
  private flattenTree(nodes: RuleNodeTreeNode[]): TraceRuleNodeMetric[] {
    const out: TraceRuleNodeMetric[] = [];
    const walk = (list: RuleNodeTreeNode[]): void => {
      for (const n of list) {
        const totalCount = n.totalCount ?? 0;
        out.push({
          ruleNodeId: n.ruleNodeId,
          ruleNodeName: n.ruleNodeName,
          ruleNodeType: n.ruleNodeType,
          ruleChainId: n.ruleChainId ?? undefined,
          ruleChainName: n.ruleChainName ?? undefined,
          executionCount: totalCount,
          failedExecutionCount: n.errors ?? 0,
          timeoutCount: 0,
          avgDurationMs: totalCount > 0 ? (n.totalTime ?? 0) / totalCount : 0,
          maxDurationMs: 0,
          p95DurationMs: 0,
          totalDurationMs: n.totalTime ?? 0,
        });
        walk(n.children ?? []);
      }
    };
    walk(nodes);
    return out;
  }
}
