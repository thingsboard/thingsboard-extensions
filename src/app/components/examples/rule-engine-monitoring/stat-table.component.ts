import {
  ChangeDetectorRef, Component, EventEmitter, Injector,
  Input, OnChanges, OnDestroy, Output, SimpleChanges
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  CompareState, FilterOptions, FilterState,
  MergedStatsDelta, MergedStatsTableRow, MergedTableRow, MetricDelta
} from './rule-engine-monitoring.models';
import { RuleEngineMonitoringWidgetService, RuleEngineHttpError } from './rule-engine-monitoring.service';
import {
  comparisonLabel, formatAvgDuration, formatDuration, METRIC_POLARITY
} from './rule-engine-monitoring.utils';

// ── Sort model ────────────────────────────────────────────────────────────────

type SortDirection = 'asc' | 'desc';

type SortField =
  | 'queueName' | 'ruleChainName' | 'ruleNodeName' | 'serviceName'
  | 'execCountValue'         | 'execCountDeltaPercent'
  | 'avgDurationValue'       | 'avgDurationDeltaPercent'
  | 'maxDurationValue'       | 'maxDurationDeltaPercent'
  | 'totalProcessingValue'   | 'totalProcessingDeltaPercent'
  | 'errorCountValue'        | 'errorCountDeltaPercent'
  | 'timeoutCountValue'      | 'timeoutCountDeltaPercent';

interface SortRule { field: SortField; direction: SortDirection; }

// ── Internal interfaces ───────────────────────────────────────────────────────

interface GroupByOption { label: string; value: string; }

interface MetricCell {
  primary: string;       // compareValue (or raw value in non-compare mode), or "N/A"
  deltaLabel: string | null;  // "Δ +123 (+12.3%)" / "Δ +16,120" / null
  deltaColour: 'green' | 'red' | 'neutral' | null;
  rawValue: number | null;    // compareValue for sorting in non-compare mode
  deltaValue: number | null;  // compare - base for sorting in compare mode; null → bottom
}

interface TableRow {
  queueDisplay:     string;
  ruleChainDisplay: string;
  ruleNodeDisplay:  string;
  serviceDisplay:   string;
  queueId:          string | null;
  ruleChainId:      string | null;
  ruleNodeId:       string | null;
  serviceId:        string | null;
  execCount:    MetricCell;
  avgDuration:  MetricCell;
  maxDuration:  MetricCell;
  totalDuration:MetricCell;
  errorCount:   MetricCell;
  timeoutCount: MetricCell;
}

// ── Column → SortField maps ───────────────────────────────────────────────────

const DIM_FIELD: Partial<Record<string, SortField>> = {
  queue: 'queueName', ruleChain: 'ruleChainName', ruleNode: 'ruleNodeName', service: 'serviceName',
};
const METRIC_VALUE_FIELD: Partial<Record<string, SortField>> = {
  execCount: 'execCountValue',       avgDuration: 'avgDurationValue',       maxDuration: 'maxDurationValue',
  totalDuration: 'totalProcessingValue', errorCount: 'errorCountValue', timeoutCount: 'timeoutCountValue',
};
const METRIC_DELTA_FIELD: Partial<Record<string, SortField>> = {
  execCount: 'execCountDeltaPercent', avgDuration: 'avgDurationDeltaPercent', maxDuration: 'maxDurationDeltaPercent',
  totalDuration: 'totalProcessingDeltaPercent', errorCount: 'errorCountDeltaPercent', timeoutCount: 'timeoutCountDeltaPercent',
};

// Backend sentinel ids ("No Rule Chain"/"No Rule Node"/"No Queue"/"Unknown Queue") — not navigable
const SENTINEL_IDS = new Set([
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000004',
]);

const GROUP_OPTIONS: GroupByOption[] = [
  { label: 'Queue',      value: 'queueId' },
  { label: 'Rule Chain', value: 'ruleChainId' },
  { label: 'Rule Node',  value: 'ruleNodeId' },
  { label: 'Service',    value: 'serviceId' },
];

@Component({
  selector: 'tb-rem-stat-table',
  templateUrl: './stat-table.component.html',
  styleUrls: ['./stat-table.component.scss'],
  standalone: false,
})
export class StatTableComponent implements OnChanges, OnDestroy {

  @Input() filterState:   FilterState   | null = null;
  @Input() compareState:  CompareState  | null = null;
  @Input() filterOptions: FilterOptions | null = null;
  @Input() injector:      Injector      | null = null;

  @Output() filterChange = new EventEmitter<FilterState>();

  readonly groupOptions = GROUP_OPTIONS;
  selectedGroupBy: string[] = [];
  rows: TableRow[] = [];
  compareMode = false;
  loading = false;
  errorMessage: string | null = null;

  readonly displayedColumns = [
    'queue', 'ruleChain', 'ruleNode', 'service',
    'execCount', 'avgDuration', 'maxDuration', 'totalDuration', 'errorCount', 'timeoutCount'
  ];

  sortRules: SortRule[] = [];
  activeMetricCol: string | null = null; // active metric for abs-desc sort in compare mode

  private prevCompareMode = false;
  private service: RuleEngineMonitoringWidgetService | null = null;
  private sub: Subscription | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['injector'] && this.injector && !this.service) {
      this.service = new RuleEngineMonitoringWidgetService(this.injector);
    }
    if ((changes['filterState'] || changes['compareState']) && this.filterState && this.service) {
      this.fetch();
    }
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  /** Blocking spinner only on the very first load; later refreshes update in place. */
  get initialLoading(): boolean {
    return this.loading && this.rows.length === 0;
  }

  trackByRow(_: number, row: TableRow): string {
    return [row.queueId, row.ruleChainId, row.ruleNodeId, row.serviceId].join('|');
  }

  onGroupByChange(): void {
    if (this.filterState && this.service) this.fetch();
  }

  /** True when this metric column is the active metric sort in compare mode. */
  isActiveMetricCol(col: string): boolean {
    return this.compareMode && this.activeMetricCol === col && METRIC_DELTA_FIELD[col] !== undefined;
  }

  /** Returns the active dimension sort rule for a column, or null. */
  getSortRule(col: string): { priority: number; direction: SortDirection } | null {
    const field = DIM_FIELD[col] ?? (!this.compareMode ? METRIC_VALUE_FIELD[col] : undefined);
    if (!field) return null;
    const idx = this.sortRules.findIndex(r => r.field === field);
    return idx < 0 ? null : { priority: idx + 1, direction: this.sortRules[idx].direction };
  }

  onHeaderClick(col: string): void {
    if (this.compareMode && METRIC_DELTA_FIELD[col] !== undefined) {
      // Metric column in compare mode: toggle off if already active, otherwise switch
      this.activeMetricCol = this.activeMetricCol === col ? null : col;
    } else {
      // Dimension column or non-compare metric: regular ASC/DESC toggle
      const field = this.fieldFor(col);
      if (!field) return;

      const idx = this.sortRules.findIndex(r => r.field === field);
      if (idx < 0) {
        this.sortRules = [...this.sortRules, { field, direction: 'asc' }];
      } else if (this.sortRules[idx].direction === 'asc') {
        const updated = [...this.sortRules];
        updated[idx] = { field, direction: 'desc' };
        this.sortRules = updated;
      } else {
        this.sortRules = this.sortRules.filter((_, i) => i !== idx);
      }
    }

    this.applySort();
    this.cdr.detectChanges();
  }

  clearSort(): void {
    this.sortRules = [];
    this.activeMetricCol = null;
    this.applySort();
    this.cdr.detectChanges();
  }

  /** Link to the rule chain page, or null when the row has no navigable rule chain. */
  ruleChainLink(row: TableRow): string | null {
    if (!row.ruleChainId || SENTINEL_IDS.has(row.ruleChainId)) return null;
    return `${window.location.origin}/ruleChains/${encodeURIComponent(row.ruleChainId)}`;
  }

  /** Link to the rule node inside its rule chain, or null when not resolvable. */
  ruleNodeLink(row: TableRow): string | null {
    if (!row.ruleNodeId || SENTINEL_IDS.has(row.ruleNodeId)) return null;
    const chainId = row.ruleChainId
      ?? this.filterOptions?.ruleNodes.find(n => n.id === row.ruleNodeId)?.ruleChainId;
    if (!chainId || SENTINEL_IDS.has(chainId)) return null;
    return `${window.location.origin}/ruleChains/${encodeURIComponent(chainId)}?ruleNodeId=${encodeURIComponent(row.ruleNodeId)}`;
  }

  onRowClick(row: TableRow): void {
    if (!this.filterState || this.compareState !== null) return;
    const update: FilterState = { ...this.filterState };
    if (row.queueId     !== null) update.queueIds     = [row.queueId];
    if (row.ruleChainId !== null) update.ruleChainIds = [row.ruleChainId];
    if (row.ruleNodeId  !== null) update.ruleNodeIds  = [row.ruleNodeId];
    if (row.serviceId   !== null) update.serviceIds   = [row.serviceId];
    this.filterChange.emit(update);
  }

  private fieldFor(col: string): SortField | undefined {
    return DIM_FIELD[col]
      ?? (this.compareMode ? METRIC_DELTA_FIELD[col] : METRIC_VALUE_FIELD[col]);
  }

  private getSortValue(row: TableRow, field: SortField): number | string | null {
    switch (field) {
      case 'queueName':                   return row.queueDisplay;
      case 'ruleChainName':               return row.ruleChainDisplay;
      case 'ruleNodeName':                return row.ruleNodeDisplay;
      case 'serviceName':                 return row.serviceDisplay;
      case 'execCountValue':              return row.execCount.rawValue;
      case 'execCountDeltaPercent':       return row.execCount.deltaValue;
      case 'avgDurationValue':            return row.avgDuration.rawValue;
      case 'avgDurationDeltaPercent':     return row.avgDuration.deltaValue;
      case 'maxDurationValue':            return row.maxDuration.rawValue;
      case 'maxDurationDeltaPercent':     return row.maxDuration.deltaValue;
      case 'totalProcessingValue':        return row.totalDuration.rawValue;
      case 'totalProcessingDeltaPercent': return row.totalDuration.deltaValue;
      case 'errorCountValue':             return row.errorCount.rawValue;
      case 'errorCountDeltaPercent':      return row.errorCount.deltaValue;
      case 'timeoutCountValue':           return row.timeoutCount.rawValue;
      case 'timeoutCountDeltaPercent':    return row.timeoutCount.deltaValue;
    }
  }

  private applySort(): void {
    const hasMetricSort = this.compareMode && this.activeMetricCol && METRIC_DELTA_FIELD[this.activeMetricCol];
    if (!hasMetricSort && this.sortRules.length === 0) return;

    this.rows = [...this.rows].sort((a, b) => {
      // Primary: active metric sort — abs(deltaValue) DESC, nulls last
      if (hasMetricSort) {
        const field = METRIC_DELTA_FIELD[this.activeMetricCol!]!;
        const va = this.getSortValue(a, field) as number | null;
        const vb = this.getSortValue(b, field) as number | null;
        if (va === null && vb !== null) return 1;
        if (va !== null && vb === null) return -1;
        if (va !== null && vb !== null) {
          const cmp = Math.abs(vb) - Math.abs(va);
          if (cmp !== 0) return cmp;
        }
      }

      // Secondary: dimension sort rules (tiebreakers)
      for (const rule of this.sortRules) {
        const va = this.getSortValue(a, rule.field);
        const vb = this.getSortValue(b, rule.field);
        if (va === null && vb === null) continue;
        if (va === null) return 1;
        if (vb === null) return -1;
        const cmp = typeof va === 'string'
          ? va.localeCompare(vb as string)
          : (va as number) - (vb as number);
        if (cmp !== 0) return rule.direction === 'asc' ? cmp : -cmp;
      }
      return 0;
    });
  }

  private fetch(): void {
    this.sub?.unsubscribe();
    this.errorMessage = null;

    if (this.compareState !== null && this.compareState.baseRange === null) {
      this.loading = false;
      this.compareMode = false;
      this.rows = [];
      this.cdr.detectChanges();
      return;
    }

    this.loading = true;
    const newCompareMode = !!(this.compareState?.compareRange);
    if (newCompareMode !== this.prevCompareMode) {
      this.sortRules = [];
      this.activeMetricCol = newCompareMode ? 'execCount' : null;
      this.prevCompareMode = newCompareMode;
    }
    this.compareMode = newCompareMode;
    this.cdr.detectChanges();

    const filter: FilterState = this.compareState?.baseRange
      ? { ...this.filterState!, startTs: this.compareState.baseRange.startTs, endTs: this.compareState.baseRange.endTs }
      : this.filterState!;
    const cmpFilter: FilterState | undefined = this.compareState?.compareRange
      ? { ...this.filterState!, startTs: this.compareState.compareRange.startTs, endTs: this.compareState.compareRange.endTs }
      : undefined;
    const dims = this.selectedGroupBy;

    if (cmpFilter) {
      this.sub = this.service!.getStatsTableCompare(filter, cmpFilter, dims).subscribe({
        next: (deltaRows: MergedStatsDelta[]) => {
          this.rows = this.buildCompareRowsFromDelta(deltaRows);
          this.applySort();
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err: RuleEngineHttpError) => this.handleError(err),
      });
    } else {
      this.sub = this.service!.getStatsTable(filter, dims).subscribe({
        next: (rows: MergedStatsTableRow[]) => {
          this.rows = this.buildRows(this.resolveNames(rows));
          this.applySort();
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err: RuleEngineHttpError) => this.handleError(err),
      });
    }
  }

  private resolveNames(rows: MergedStatsTableRow[]): MergedTableRow[] {
    const opts = this.filterOptions;
    return rows.map(r => ({
      ...r,
      queueName:     opts?.queues.find(q => q.id === r.queueId)?.name         ?? r.queueId,
      ruleChainName: opts?.ruleChains.find(c => c.id === r.ruleChainId)?.name ?? r.ruleChainId,
      ruleNodeName:  opts?.ruleNodes.find(n => n.id === r.ruleNodeId)?.name   ?? r.ruleNodeId,
    }));
  }

  private dimLabel(row: MergedTableRow, which: 'queue' | 'ruleChain' | 'ruleNode'): string {
    if (which === 'queue')     return row.queueName     ?? row.queueId     ?? this.fallbackLabel('queue');
    if (which === 'ruleChain') return row.ruleChainName ?? row.ruleChainId ?? this.fallbackLabel('ruleChain');
    return                            row.ruleNodeName  ?? row.ruleNodeId  ?? this.fallbackLabel('ruleNode');
  }

  /** When not grouped by a dimension, show the active filter selection instead of "All". */
  private fallbackLabel(which: 'queue' | 'ruleChain' | 'ruleNode' | 'service'): string {
    const fs = this.filterState;
    if (!fs) return 'All';
    const opts = this.filterOptions;
    let ids: string[];
    let resolve: (id: string) => string | undefined;
    switch (which) {
      case 'queue':
        ids = fs.queueIds;
        resolve = id => opts?.queues.find(q => q.id === id)?.name;
        break;
      case 'ruleChain':
        ids = fs.ruleChainIds;
        resolve = id => opts?.ruleChains.find(c => c.id === id)?.name;
        break;
      case 'ruleNode':
        ids = fs.ruleNodeIds;
        resolve = id => opts?.ruleNodes.find(n => n.id === id)?.name;
        break;
      case 'service':
        ids = fs.serviceIds;
        resolve = () => undefined;
        break;
    }
    if (!ids?.length) return 'All';
    return ids.map(id => resolve(id) ?? id).join(', ');
  }

  private buildRows(rows: MergedTableRow[]): TableRow[] {
    return rows.map(r => ({
      queueDisplay:     this.dimLabel(r, 'queue'),
      ruleChainDisplay: this.dimLabel(r, 'ruleChain'),
      ruleNodeDisplay:  this.dimLabel(r, 'ruleNode'),
      serviceDisplay:   r.serviceId ?? this.fallbackLabel('service'),
      queueId:          r.queueId,
      ruleChainId:      r.ruleChainId,
      ruleNodeId:       r.ruleNodeId,
      serviceId:        r.serviceId,
      execCount:    this.cell(r.execCount,       undefined, false, v => (v ?? 0).toLocaleString()),
      avgDuration:  this.cell(r.avgDurationMs,   undefined, true,  v => formatAvgDuration(v ?? 0)),
      maxDuration:  this.cell(r.maxDurationMs,   undefined, true,  v => formatDuration(v ?? 0)),
      totalDuration:this.cell(r.totalDurationMs, undefined, true,  v => formatDuration(v ?? 0)),
      errorCount:   this.cell(r.errorCount,      undefined, true,  v => (v ?? 0).toLocaleString()),
      timeoutCount: this.cell(r.timeoutCount,    undefined, true,  v => (v ?? 0).toLocaleString()),
    }));
  }

  private buildCompareRows(cur: MergedTableRow[], cmp: MergedTableRow[], dims: string[]): TableRow[] {
    const cmpMap = new Map<string, MergedTableRow>();
    for (const r of cmp) cmpMap.set(this.rowKey(r, dims), r);
    const curMap = new Map<string, MergedTableRow>();
    for (const r of cur) curMap.set(this.rowKey(r, dims), r);

    const tableRows: TableRow[] = [];
    for (const key of new Set([...curMap.keys(), ...cmpMap.keys()])) {
      const c   = curMap.get(key);
      const p   = cmpMap.get(key);
      const ref = c ?? p!;

      const execCell  = this.cell(c?.execCount       ?? null, p?.execCount       ?? null, false, v => (v ?? 0).toLocaleString());
      const avgCell   = this.cell(c?.avgDurationMs   ?? null, p?.avgDurationMs   ?? null, true,  v => formatAvgDuration(v ?? 0));
      const maxCell   = this.cell(c?.maxDurationMs   ?? null, p?.maxDurationMs   ?? null, true,  v => formatDuration(v ?? 0));
      const totCell   = this.cell(c?.totalDurationMs ?? null, p?.totalDurationMs ?? null, true,  v => formatDuration(v ?? 0));
      const errCell   = this.cell(c?.errorCount      ?? null, p?.errorCount      ?? null, true,  v => (v ?? 0).toLocaleString());
      const toCell    = this.cell(c?.timeoutCount    ?? null, p?.timeoutCount    ?? null, true,  v => (v ?? 0).toLocaleString());

      tableRows.push({
        queueDisplay:     this.dimLabel(ref, 'queue'),
        ruleChainDisplay: this.dimLabel(ref, 'ruleChain'),
        ruleNodeDisplay:  this.dimLabel(ref, 'ruleNode'),
        serviceDisplay:   ref.serviceId ?? this.fallbackLabel('service'),
        queueId:          ref.queueId,
        ruleChainId:      ref.ruleChainId,
        ruleNodeId:       ref.ruleNodeId,
        serviceId:        ref.serviceId ?? null,
        execCount: execCell, avgDuration: avgCell, maxDuration: maxCell, totalDuration: totCell,
        errorCount: errCell, timeoutCount: toCell,
      });
    }
    return tableRows;
  }

  private buildCompareRowsFromDelta(deltaRows: MergedStatsDelta[]): TableRow[] {
    const opts = this.filterOptions;
    const resolveName = (id: string | null, find: (id: string) => string | undefined) =>
      id ? (find(id) ?? id) : null;

    return deltaRows.map(r => {
      const queueName     = resolveName(r.queueId,     id => opts?.queues.find(q => q.id === id)?.name);
      const ruleChainName = resolveName(r.ruleChainId, id => opts?.ruleChains.find(c => c.id === id)?.name);
      const ruleNodeName  = resolveName(r.ruleNodeId,  id => opts?.ruleNodes.find(n => n.id === id)?.name);

      const execCell  = this.cellFromDelta(r.execCount,       false, v => (v ?? 0).toLocaleString());
      const avgCell   = this.cellFromDelta(r.avgDurationMs,   true,  v => formatAvgDuration(v ?? 0));
      const maxCell   = this.cellFromDelta(r.maxDurationMs,   true,  v => formatDuration(v ?? 0));
      const totCell   = this.cellFromDelta(r.totalDurationMs, true,  v => formatDuration(v ?? 0));
      const errCell   = this.cellFromDelta(r.errorCount,      true,  v => (v ?? 0).toLocaleString());
      const toCell    = this.cellFromDelta(r.timeoutCount,    true,  v => (v ?? 0).toLocaleString());

      return {
        queueDisplay:     queueName     ?? r.queueId     ?? this.fallbackLabel('queue'),
        ruleChainDisplay: ruleChainName ?? r.ruleChainId ?? this.fallbackLabel('ruleChain'),
        ruleNodeDisplay:  ruleNodeName  ?? r.ruleNodeId  ?? this.fallbackLabel('ruleNode'),
        serviceDisplay:   r.serviceId ?? this.fallbackLabel('service'),
        queueId:          r.queueId,
        ruleChainId:      r.ruleChainId,
        ruleNodeId:       r.ruleNodeId,
        serviceId:        r.serviceId,
        execCount: execCell, avgDuration: avgCell, maxDuration: maxCell, totalDuration: totCell,
        errorCount: errCell, timeoutCount: toCell,
      };
    });
  }

  private cellFromDelta(
    d: MetricDelta,
    lowerIsBetter: boolean,
    fmt: (v: number | null) => string
  ): MetricCell {
    if (d.compareValue === null && d.baseValue === null) {
      return { primary: 'N/A', deltaLabel: null, deltaColour: null, rawValue: null, deltaValue: null };
    }
    return this.cell(d.baseValue ?? 0, d.compareValue ?? 0, lowerIsBetter, fmt);
  }

  // cmp === undefined → not in compare mode
  private cell(
    cur: number | null,
    cmp: number | null | undefined,
    lowerIsBetter: boolean,
    fmt: (v: number | null) => string
  ): MetricCell {
    if (cmp === undefined) {
      return { primary: fmt(cur), deltaLabel: null, deltaColour: null, rawValue: cur, deltaValue: null };
    }

    const base = cur ?? 0;
    const comp = cmp ?? 0;

    if (base === 0 && comp === 0) {
      return { primary: fmt(0), deltaLabel: null, deltaColour: null, rawValue: 0, deltaValue: 0 };
    }

    if (base === 0) {
      const colour = lowerIsBetter ? 'red' : 'green';
      return { primary: fmt(comp), deltaLabel: `Δ +${fmt(comp)}`, deltaColour: colour, rawValue: comp, deltaValue: comp };
    }

    const delta  = comp - base;
    const pct    = delta / base * 100;
    const colour = delta === 0 ? 'neutral' : comparisonLabel(pct, lowerIsBetter).colour;
    const sign   = delta > 0 ? '+' : '-';
    const deltaLabel = delta === 0
      ? null
      : `Δ ${sign}${fmt(Math.abs(delta))} (${delta > 0 ? '+' : ''}${pct.toFixed(1)}%)`;

    return { primary: fmt(comp), deltaLabel, deltaColour: colour, rawValue: comp, deltaValue: delta };
  }

  private rowKey(r: MergedTableRow, dims: string[]): string {
    return dims.map(d => (r as unknown as Record<string, string | null | undefined>)[d] ?? '').join('|');
  }

  private handleError(err: RuleEngineHttpError): void {
    this.loading = false;
    this.errorMessage = err?.status === 401 || err?.status === 403
      ? 'Access denied. Please log in with sufficient permissions.'
      : 'Failed to load table data.';
    this.cdr.detectChanges();
  }
}
