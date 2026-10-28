import {
  AfterViewInit, ChangeDetectorRef, Component, ElementRef, EventEmitter,
  Injector, Input, OnChanges, OnDestroy, Output, QueryList, SimpleChanges, ViewChildren
} from '@angular/core';
import * as echarts from 'echarts/core';
import { EChartsOption } from 'echarts';
import { BarChart, LineChart, ScatterChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { combineLatest, Subscription } from 'rxjs';
import { FilterState, NodeTsEntry, QueueLagTsEntry, QueueTsEntry } from './rule-engine-monitoring.models';
import { RuleEngineMonitoringWidgetService, RuleEngineHttpError } from './rule-engine-monitoring.service';
import { densifyTimeSeries, FillMode, formatAvgDuration, formatCompact, formatDuration, SparsePoint } from './rule-engine-monitoring.utils';

interface SeriesDef {
  key: string;
  label: string;
  color: string;
  description: string;
  // 'zero' → missing bucket means no activity (count/sum/gauge); 'null' → metric undefined
  // when no executions happened (duration), rendered as a gap and "No executions" in tooltip.
  fillMode: FillMode;
  type: 'bar' | 'line' | 'scatter';
  step?: boolean;        // render a line as a step line (queue lag)
  barWidth?: string | number;   // number = px (used for thin spike bars)
  barGap?: string;
  symbol?: string;          // scatter marker shape
  // Scatter overlays anchored on the same bucket as the main bar. Zero buckets render no marker
  // (and the axis is hidden when the whole visible range is zero) to avoid baseline noise, while
  // the data point is kept dense so the tooltip still reports "0" for that bucket.
  hideZeroMarker?: boolean;
}

type ChartId = 'activity' | 'latencyPerExec' | 'latencyTotal' | 'lag';

interface ChartDef {
  id: ChartId;
  section: string;   // grouping header; charts sharing a section render together
  title?: string;    // optional per-chart sub-title (used when a section holds several charts)
  series: SeriesDef[];
}

const CHART_DEFS: ChartDef[] = [
  // One bucket = one block: executions is the main bar, failures/timeouts are centered markers
  // anchored on the same bucket x (never neighboring bars), so they read as annotations of the block.
  { id: 'activity', section: 'Activity', series: [
    { key: 'execCount',    label: 'Rule Node Executions',        color: '#5470c6', fillMode: 'zero', type: 'bar', barWidth: '60%',                                description: 'Number of rule node executions per time bucket.' },
    { key: 'errorCount',   label: 'Rule Node Failed Executions', color: '#ee6666', fillMode: 'zero', type: 'scatter', symbol: 'triangle', hideZeroMarker: true,   description: 'Number of failed rule node executions per time bucket. Marked on the same bucket as executions.' },
    { key: 'timeoutCount', label: 'Queue Timeout Count',         color: '#fac858', fillMode: 'zero', type: 'scatter', symbol: 'diamond',  hideZeroMarker: true,   description: 'Timed out messages per time bucket. Marked on the same bucket as executions.' },
  ] },
  // Latency is split into two lanes: per-execution latency (ms) and total processing cost
  // (s/min/h). They share the time x-axis but keep separate scales so total bars can't flatten avg/max.
  { id: 'latencyPerExec', section: 'Latency', title: 'Per-execution latency', series: [
    { key: 'avgDurationMs', label: 'Avg Rule Node Duration', color: '#91cc75', fillMode: 'null', type: 'line',                description: 'Average rule node execution duration per time bucket.' },
    { key: 'maxDurationMs', label: 'Max Rule Node Duration', color: '#9a60b4', fillMode: 'null', type: 'bar', barWidth: 3, description: 'Maximum rule node execution duration per time bucket, drawn as a per-bucket latency spike.' },
  ] },
  { id: 'latencyTotal', section: 'Latency', title: 'Total execution duration', series: [
    { key: 'totalDurationMs', label: 'Total Rule Node Execution Duration', color: '#73c0de', fillMode: 'zero', type: 'bar', barWidth: '60%', description: 'Sum of rule node execution durations per time bucket (total processing cost spent inside the bucket).' },
  ] },
  { id: 'lag', section: 'Queue Lag', series: [
    { key: 'lag', label: 'Max Queue Lag', color: '#ee82ee', fillMode: 'zero', type: 'line', step: true, description: 'Highest one-queue lag per time bucket' },
  ] },
];

const ALL_SERIES: SeriesDef[] = CHART_DEFS.flatMap(c => c.series);

interface TooltipRow { label: string; color: string; value: string; }

// Tooltip metric names and colors match the chart series exactly.
const FULL_LABELS: Record<string, string> = Object.fromEntries(ALL_SERIES.map(s => [s.key, s.label]));
const SERIES_COLORS: Record<string, string> = Object.fromEntries(ALL_SERIES.map(s => [s.key, s.color]));

// Charts grouped by section, preserving CHART_DEFS order (so #chartContainer DOM order matches).
const SECTIONS: { title: string; charts: ChartDef[] }[] = CHART_DEFS.reduce((acc, c) => {
  const last = acc[acc.length - 1];
  if (last && last.title === c.section) {
    last.charts.push(c);
  } else {
    acc.push({ title: c.section, charts: [c] });
  }
  return acc;
}, [] as { title: string; charts: ChartDef[] }[]);

const AXIS_GAP = 65;
const GRID_TOP = 12;
const GRID_BOTTOM_NO_SLIDER = 22; // room for x-axis labels only (no visible slider)

// All chart instances join this ECharts group so hover (crosshair) and zoom stay synchronized.
const SYNC_GROUP = 'rule-engine-metrics';

@Component({
  selector: 'tb-rem-trend-chart',
  templateUrl: './trend-chart.component.html',
  styleUrls: ['./trend-chart.component.scss'],
  standalone: false
})
export class TrendChartComponent implements OnChanges, AfterViewInit, OnDestroy {

  @ViewChildren('chartContainer') chartContainers: QueryList<ElementRef<HTMLElement>>;

  @Input() filterState: FilterState | null = null;
  @Input() rangeSelectActive = false;
  @Input() compareActive = false;
  @Input() injector: Injector | null = null;

  @Output() rangeSelected = new EventEmitter<{ start: number; end: number }>();
  @Output() refresh = new EventEmitter<void>();

  readonly intervals = [
    { label: '1m',  ms: 60_000 },
    { label: '5m',  ms: 300_000 },
    { label: '10m', ms: 600_000 },
    { label: '15m', ms: 900_000 },
    { label: '30m', ms: 1_800_000 },
    { label: '1h',  ms: 3_600_000 },
    { label: '1d',  ms: 86_400_000 },
  ];
  selectedIntervalMs = 3_600_000;

  readonly refreshIntervals = [
    { label: 'None',   value: 0 },
    { label: '5 sec',  value: 5_000 },
    { label: '10 sec', value: 10_000 },
    { label: '15 sec', value: 15_000 },
    { label: '30 sec', value: 30_000 },
    { label: '1m',     value: 60_000 },
  ];
  refreshIntervalMs = 0;

  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  readonly sections = SECTIONS;
  seriesVisible: Record<string, boolean> = Object.fromEntries(ALL_SERIES.map(d => [d.key, true]));

  loading = false;
  errorMessage: string | null = null;

  // Per-series "Last" (most recent bucket) and "Max" values for the current range, shown by each chart.
  statsByKey: Record<string, { last: string; max: string }> = {};

  readonly timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  /** Blocking spinner only on the very first load; later refreshes update the chart in place. */
  get initialLoading(): boolean {
    return this.loading && this.lastNodeData.length === 0 && this.lastQueueData.length === 0 && this.lastLagData.length === 0;
  }

  private static readonly BRUSH_STYLE = {
    color: 'rgba(84,112,198,0.15)', borderColor: 'rgba(84,112,198,0.6)', borderWidth: 1,
  };

  private charts = new Map<ChartId, echarts.EChartsType>();
  private service: RuleEngineMonitoringWidgetService | null = null;
  private sub: Subscription | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private lastNodeData: NodeTsEntry[] = [];
  private lastQueueData: QueueTsEntry[] = [];
  private lastLagData: QueueLagTsEntry[] = [];
  // Per-bucket lookup so the tooltip can show every metric (across all charts) for a hovered bucket.
  private nodeByBucket = new Map<number, NodeTsEntry>();
  private queueByBucket = new Map<number, QueueTsEntry>();
  private lagByBucket = new Map<number, QueueLagTsEntry>();

  // Brush-selection state
  private brushDone: 0 | 1 | 2 = 0;
  private firstBrushRange: [number, number] | null = null;
  // The chart the first drag landed on; subsequent drags are locked to it.
  private activeBrushChart: ChartId | null = null;
  // The chart under the cursor — only it shows the floating tooltip box; peers show the synced
  // crosshair only. Keeps a single tooltip across the connected group.
  private activeTooltipChart: ChartId | null = null;

  constructor(private cdr: ChangeDetectorRef) {
    echarts.use([LineChart, BarChart, ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, BrushComponent, MarkAreaComponent, CanvasRenderer]);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['injector'] && this.injector && !this.service) {
      this.service = new RuleEngineMonitoringWidgetService(this.injector);
    }
    if (changes['compareActive'] && this.charts.size) {
      if (!this.compareActive) {
        // Compare mode turned off — clear all overlays and reset state
        this.resetBrushState();
      }
      // Suppress the floating tooltip during range selection so it doesn't fight the brush drag.
      this.updateTooltipMode();
    }
    if (changes['compareActive']) {
      // Pause auto-refresh while comparing (a reload would recompute the time window), resume after.
      this.applyAutoRefresh();
    }
    if (changes['rangeSelectActive'] && this.charts.size) {
      if (this.rangeSelectActive) {
        // Reset button pressed in compare mode — clear and re-enable brush
        this.resetBrushState();
      }
      this.updateBrushMode();
    }
    if (changes['filterState'] && this.filterState && this.service && this.charts.size) {
      this.fetch();
    }
  }

  ngAfterViewInit(): void {
    const containers = this.chartContainers.toArray();
    CHART_DEFS.forEach((def, i) => {
      const el = containers[i].nativeElement;
      const chart = echarts.init(el, null, { renderer: 'canvas' });
      chart.group = SYNC_GROUP;
      chart.on('brushEnd', (params: any) => this.onBrushEnd(def.id, params));
      chart.setOption(this.buildBaseOption(def));
      this.charts.set(def.id, chart);
      // Only the hovered chart shows the floating tooltip; peers keep the synced crosshair only.
      el.addEventListener('mouseenter', () => this.setActiveTooltip(def.id));
    });
    // Link hover crosshair + zoom across every instance in the group.
    echarts.connect(SYNC_GROUP);

    this.resizeObserver = new ResizeObserver(() => {
      this.charts.forEach(c => c.resize());
    });
    containers.forEach(c => this.resizeObserver!.observe(c.nativeElement));

    this.updateBrushMode();

    if (this.filterState && this.service) {
      this.fetch();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.stopAutoRefresh();
    this.resizeObserver?.disconnect();
    echarts.disconnect(SYNC_GROUP);
    this.charts.forEach(c => c.dispose());
  }

  onRefreshClick(): void {
    this.refresh.emit();
  }

  onRefreshIntervalChange(): void {
    this.applyAutoRefresh();
  }

  private applyAutoRefresh(): void {
    this.stopAutoRefresh();
    if (this.refreshIntervalMs > 0 && !this.compareActive) {
      this.refreshTimer = setInterval(() => this.refresh.emit(), this.refreshIntervalMs);
    }
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer !== null) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /** Show the floating tooltip box only on the hovered chart; peers keep the synced crosshair. */
  private setActiveTooltip(chartId: ChartId): void {
    if (this.activeTooltipChart === chartId) return;
    this.activeTooltipChart = chartId;
    this.updateTooltipMode();
  }

  /** One tooltip at a time: showContent true only on the hovered chart. Suppressed entirely while
   *  compare mode is on so the tooltip doesn't interfere with range-selection dragging. */
  private updateTooltipMode(): void {
    this.charts.forEach((chart, id) => {
      const show = !this.compareActive
        && (this.activeTooltipChart === null || this.activeTooltipChart === id);
      chart.setOption({ tooltip: { showContent: show } });
    });
  }

  /** Compact tooltip content: bucket interval + timezone, then only sections/rows with meaningful
   *  values (Activity non-zero; Latency only if executions happened; Queue only if lag > 0).
   *  Empty bucket → "No activity in this bucket". */
  private formatTooltip(params: any[]): string {
    if (!params?.length) return '';
    const ts = params[0].value ? params[0].value[0] : params[0].axisValue;
    const header =
      `<div style="font-size:12px;font-weight:700;color:rgba(0,0,0,0.82)">${this.bucketRange(ts)}</div>` +
      `<div style="font-size:10px;color:rgba(0,0,0,0.45);margin-bottom:4px">${this.timeZone}</div>`;

    const groups = this.buildBucketGroups(ts);
    if (!groups.length) {
      return `<div style="min-width:120px">${header}<div style="font-style:italic;color:rgba(0,0,0,0.45)">No activity in this bucket</div></div>`;
    }
    const body = groups.map(g =>
      `<div style="margin-top:6px">` +
        `<div style="font-size:12px;font-weight:700;color:rgba(0,0,0,0.82)">${g.title}</div>` +
        g.items.map(it =>
          `<div style="display:flex;justify-content:space-between;align-items:center;gap:16px;line-height:1.5">` +
            `<span style="display:flex;align-items:center;gap:6px;color:rgba(0,0,0,0.6)">` +
              `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${it.color};flex-shrink:0"></span>` +
              `${it.label}` +
            `</span>` +
            `<span style="font-weight:600;color:rgba(0,0,0,0.85)">${it.value}</span>` +
          `</div>`).join('') +
      `</div>`).join('');
    return `<div style="min-width:160px">${header}${body}</div>`;
  }

  /** Meaningful metric values for a bucket, grouped by family (Activity / Latency / Queue). */
  private buildBucketGroups(ts: number): { title: string; items: TooltipRow[] }[] {
    const exec     = this.rawAt('execCount', ts)    ?? 0;
    const failed   = this.rawAt('errorCount', ts)   ?? 0;
    const timeouts = this.rawAt('timeoutCount', ts) ?? 0;
    const lag      = this.rawAt('lag', ts)          ?? 0;

    const out: { title: string; items: TooltipRow[] }[] = [];
    const row = (key: string, v: number): TooltipRow =>
      ({ label: this.labelFor(key), color: SERIES_COLORS[key], value: this.compactValue(key, v) });

    const activity: TooltipRow[] = [];
    if (this.seriesVisible['execCount']    && exec > 0)     activity.push(row('execCount', exec));
    if (this.seriesVisible['errorCount']   && failed > 0)   activity.push(row('errorCount', failed));
    if (this.seriesVisible['timeoutCount'] && timeouts > 0) activity.push(row('timeoutCount', timeouts));
    if (activity.length) out.push({ title: 'Activity', items: activity });

    // Latency only makes sense when executions occurred (otherwise avg/max are null, total is 0).
    if (exec > 0) {
      const latency: TooltipRow[] = [];
      const avg   = this.rawAt('avgDurationMs', ts);
      const max   = this.rawAt('maxDurationMs', ts);
      const total = this.rawAt('totalDurationMs', ts);
      if (this.seriesVisible['avgDurationMs']   && avg   !== null) latency.push(row('avgDurationMs', avg));
      if (this.seriesVisible['maxDurationMs']   && max   !== null) latency.push(row('maxDurationMs', max));
      if (this.seriesVisible['totalDurationMs'] && total !== null) latency.push(row('totalDurationMs', total));
      if (latency.length) out.push({ title: 'Latency', items: latency });
    }

    if (this.seriesVisible['lag'] && lag > 0) {
      out.push({ title: 'Queue Lag', items: [row('lag', lag)] });
    }

    return out;
  }

  /** Bucket time range for the tooltip header, e.g. "14:00 - 14:05" (dates for day-sized buckets). */
  private bucketRange(ts: number): string {
    const endTs = ts + this.selectedIntervalMs;
    if (this.selectedIntervalMs >= 86_400_000) {
      return `${new Date(ts).toLocaleDateString('en-GB')} - ${new Date(endTs).toLocaleDateString('en-GB')}`;
    }
    const opts: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit', hour12: false };
    return `${new Date(ts).toLocaleTimeString('en-GB', opts)} - ${new Date(endTs).toLocaleTimeString('en-GB', opts)}`;
  }

  private rawAt(key: string, ts: number): number | null {
    const def = ALL_SERIES.find(s => s.key === key);
    return def ? this.valueAtBucket(def, ts) : null;
  }

  private compactValue(key: string, v: number): string {
    if (key === 'avgDurationMs') return formatAvgDuration(v);
    if (key === 'maxDurationMs' || key === 'totalDurationMs') return formatDuration(v);
    return formatCompact(v);
  }

  private onBrushEnd(chartId: ChartId, params: any): void {
    if (this.brushDone >= 2) return;
    // Lock the 2nd drag to the chart the 1st drag landed on. Brush stays enabled on every chart
    // (see updateBrushMode), so a stray drag on another chart is ignored and its rectangle cleared.
    if (this.activeBrushChart !== null && chartId !== this.activeBrushChart) {
      this.charts.get(chartId)?.dispatchAction({ type: 'brush', areas: [] });
      return;
    }

    const areas: any[] = params.areas ?? [];
    // In brushMode:'multiple', new brushes accumulate; always take the latest one
    const latestArea = areas[areas.length - 1];
    if (!latestArea) return;

    const range = latestArea.coordRange;
    if (!range || range.length !== 2) return;

    const start = Math.floor(Math.min(range[0], range[1]));
    const end   = Math.ceil(Math.max(range[0], range[1]));

    if (this.brushDone === 0) {
      // First brush: lock to this chart, clear native overlay, draw blue markArea on all, emit
      this.brushDone = 1;
      this.activeBrushChart = chartId;
      this.firstBrushRange = [start, end];
      this.clearNativeBrush();
      this.applyMarkAreas([{ range: [start, end], color: 'blue' }]);
      this.rangeSelected.emit({ start, end });
      // Re-arm brush LAST: applyMarkAreas' setOption resets the global brush cursor, so the
      // second drag would otherwise have no brush tool active. Also disables the other charts.
      this.updateBrushMode();

    } else if (this.brushDone === 1) {
      // Second brush: clear native overlay, draw both markAreas on all, disable brush, emit
      this.brushDone = 2;
      this.clearNativeBrush();
      this.applyMarkAreas([
        { range: this.firstBrushRange!, color: 'blue' },
        { range: [start, end],          color: 'orange' },
      ]);
      this.rangeSelected.emit({ start, end });
      this.updateBrushMode();  // brushDone >= 2 → disables brush everywhere
    }
  }

  onIntervalChange(): void {
    if (this.filterState && this.service && this.charts.size) {
      this.fetch();
    }
  }

  /** Display label for a series. Queue Timeout Count becomes "Queue Timeout Last-Node Hits" when a
   *  rule chain or rule node is selected (timeouts are then counted as hits on the last node). */
  labelFor(key: string): string {
    if (key === 'timeoutCount' && this.isLastNodeTimeout()) return 'Queue Timeout Last-Node Hits';
    return FULL_LABELS[key];
  }

  /** Legend info text for a series — the queue-timeout series explains the last-node grouping
   *  when a rule chain/node is selected. */
  descriptionFor(def: SeriesDef): string {
    if (def.key === 'timeoutCount' && this.isLastNodeTimeout()) {
      return 'When a timeout occurs, it is attributed to the last rule node visited before the timeout. '
        + 'Counts are grouped by that last-visited rule node.';
    }
    return def.description;
  }

  private isLastNodeTimeout(): boolean {
    const fs = this.filterState;
    return !!fs && ((fs.ruleChainIds?.length ?? 0) > 0 || (fs.ruleNodeIds?.length ?? 0) > 0);
  }

  toggleSeries(chartId: ChartId, key: string): void {
    this.seriesVisible[key] = !this.seriesVisible[key];
    // Re-render every chart: toggling changes the shared grid.left, so all charts must
    // re-align to keep their plot areas (and the synced crosshair) lined up.
    CHART_DEFS.forEach(def => this.renderChart(def));
  }

  private fetch(): void {
    this.sub?.unsubscribe();
    this.loading = true;
    this.errorMessage = null;
    this.cdr.detectChanges();

    const filter = this.filterState!;
    this.sub = combineLatest([
      this.service!.getNodeStatsTimeseries(filter, this.selectedIntervalMs),
      this.service!.getQueueStatsTimeseries(filter, this.selectedIntervalMs),
      this.service!.getQueueLagStatsTimeseries(filter, this.selectedIntervalMs),
    ]).subscribe({
      next: ([nodeData, queueData, lagData]) => {
        this.applyData(nodeData, queueData, lagData);
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err: RuleEngineHttpError) => {
        this.loading = false;
        this.errorMessage = err?.status === 401 || err?.status === 403
          ? 'Access denied.'
          : 'Failed to load chart data.';
        this.cdr.detectChanges();
      }
    });
  }

  private applyData(nodeData: NodeTsEntry[], queueData: QueueTsEntry[], lagData: QueueLagTsEntry[]): void {
    if (!this.charts.size || !this.filterState) return;

    this.lastNodeData = nodeData;
    this.lastQueueData = queueData;
    this.lastLagData = lagData;
    this.nodeByBucket = new Map(nodeData.map(d => [d.bucketTime, d]));
    this.queueByBucket = new Map(queueData.map(d => [d.bucketTime, d]));
    this.lagByBucket = new Map(lagData.map(d => [d.bucketTime, d]));

    this.computeSeriesStats();
    CHART_DEFS.forEach(def => this.renderChart(def));
  }

  /** Computes each series' most-recent ("Last") and maximum ("Max") value over the loaded range. */
  private computeSeriesStats(): void {
    const out: Record<string, { last: string; max: string }> = {};
    for (const def of ALL_SERIES) {
      let max: number | null = null;
      let lastVal: number | null = null;
      let lastTs = -Infinity;
      const apply = (ts: number, v: number | null | undefined) => {
        if (v === null || v === undefined) return;
        if (max === null || v > max) max = v;
        if (ts > lastTs) { lastTs = ts; lastVal = v; }
      };
      if (def.key === 'timeoutCount')   for (const d of this.lastQueueData) apply(d.bucketTime, d.timeoutCount);
      else if (def.key === 'lag')       for (const d of this.lastLagData)   apply(d.bucketTime, d.lag);
      else                              for (const d of this.lastNodeData)  apply(d.bucketTime, (d as any)[def.key]);
      out[def.key] = {
        last: lastVal === null ? '—' : this.compactValue(def.key, lastVal),
        max:  max     === null ? '—' : this.compactValue(def.key, max),
      };
    }
    this.statsByKey = out;
  }

  /** (Re)applies series data, y-axes and grid for one chart from the latest data and visibility.
   *  grid.left is shared across all charts so their plot areas — and the synced crosshair — align. */
  private renderChart(def: ChartDef): void {
    const chart = this.charts.get(def.id);
    if (!chart) return;
    const series = def.series.map(s => ({
      id: s.key,
      data: this.filterState && this.seriesVisible[s.key]
        ? this.extractData(s, this.lastNodeData, this.lastQueueData, this.lastLagData)
        : [],
    }));
    const opt: any = { yAxis: this.buildYAxes(def), grid: this.buildGrid(def), series };
    if (this.filterState) {
      opt.xAxis = { min: this.filterState.startTs, max: this.filterState.endTs };
    }
    // Rebuild axes/grid too: all-zero marker axis hiding and the shared grid.left depend on data.
    chart.setOption(opt, { replaceMerge: ['yAxis', 'grid'] });
  }

  private extractData(def: SeriesDef, nodeData: NodeTsEntry[], queueData: QueueTsEntry[], lagData: QueueLagTsEntry[]): [number, number | null][] {
    const filter = this.filterState!;
    const points: SparsePoint[] = [];

    if (def.key === 'timeoutCount') {
      for (const d of queueData) {
        if (d.timeoutCount != null) points.push({ bucketTime: d.bucketTime, value: d.timeoutCount });
      }
    } else if (def.key === 'lag') {
      for (const d of lagData) {
        if (d.lag != null) points.push({ bucketTime: d.bucketTime, value: d.lag });
      }
    } else {
      for (const d of nodeData) {
        const value = (d as any)[def.key];
        if (value != null) points.push({ bucketTime: d.bucketTime, value });
      }
    }

    return densifyTimeSeries(points, filter.startTs, filter.endTs, this.selectedIntervalMs, def.fillMode);
  }

  /** Builds the ECharts series config for one metric, matching its semantic visualization type. */
  private buildSeries(s: SeriesDef, axisIndex: number): any {
    // clip: true keeps any boundary bar/point inside the plot area (never over the y-axis labels).
    const base = { id: s.key, name: s.label, yAxisIndex: axisIndex, clip: true, itemStyle: { color: s.color }, data: [] as any[] };
    if (s.type === 'bar') {
      // Overlay bars share the bucket's x position (barGap '-100%'); nested widths keep each visible.
      return { ...base, type: 'bar', barWidth: s.barWidth, barGap: s.barGap, z: 2 };
    }
    if (s.type === 'scatter') {
      // Markers anchored on the bucket x. With hideZeroMarker the zero buckets render no symbol
      // (size 0) but stay in the data so the tooltip still shows "0"; otherwise a fixed size.
      const symbolSize = s.hideZeroMarker
        ? (val: any) => (val && val[1] > 0 ? 8 : 0)
        : 7;
      return { ...base, type: 'scatter', symbol: s.symbol ?? 'circle', symbolSize, z: 4 };
    }
    return {
      ...base,
      type: 'line',
      step: s.step ? 'end' : undefined,
      showSymbol: false,
      connectNulls: false,
      lineStyle: { color: s.color, width: 2 },
      z: 3,
    };
  }

  private buildBaseOption(def: ChartDef): EChartsOption {
    return {
      backgroundColor: 'transparent',
      animation: false,
      // link keeps the crosshair aligned across this instance's axes; echarts.connect() extends
      // the same alignment across the separate chart instances in the group.
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      // Compact floating tooltip near the cursor. showContent is toggled by updateTooltipMode so
      // only the hovered chart shows the box; the synced crosshair (via connect) shows on all.
      tooltip: {
        trigger: 'axis',
        confine: true,
        appendToBody: true,
        showContent: true,
        axisPointer: {
          type: 'line',
          lineStyle: { color: 'rgba(0,0,0,0.3)', width: 1 },
          label: { show: false },
        },
        // Offset from the cursor, flipping/clamping against the whole viewport (not the small chart
        // box) so a tall tooltip on the bottom chart isn't cut off at the screen edge. point is
        // chart-container-relative; we map it to page coords to decide, then convert back.
        position: (point: number[], _params: any, _dom: any, _rect: any, size: any) => {
          const [x, y] = point;
          const [tw, th] = size.contentSize;
          const offset = 12;
          const dom = this.activeTooltipChart ? this.charts.get(this.activeTooltipChart)?.getDom() : undefined;
          const cr = dom ? dom.getBoundingClientRect() : { left: 0, top: 0 } as DOMRect;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const px = cr.left + x;
          const py = cr.top + y;
          let left = px + tw + offset > vw ? px - tw - offset : px + offset;
          let top  = py + th + offset > vh ? py - th - offset : py + offset;
          left = Math.max(4, Math.min(left, vw - tw - 4));
          top  = Math.max(4, Math.min(top,  vh - th - 4));
          // Back to container-relative coords (ECharts re-adds the container's page offset).
          return [left - cr.left, top - cr.top];
        },
        formatter: (params: any[]) => this.formatTooltip(params),
      },
      grid: this.buildGrid(def),
      xAxis: {
        type: 'time',
        axisLabel: { color: 'rgba(0,0,0,0.54)', fontSize: 11, hideOverlap: true },
        splitLine: { show: true, lineStyle: { color: 'rgba(0,0,0,0.07)' } },
        axisLine: { lineStyle: { color: 'rgba(0,0,0,0.38)' } },
        axisTick: { lineStyle: { color: 'rgba(0,0,0,0.38)' } },
      },
      yAxis: this.buildYAxes(def),
      series: [
        ...def.series.map((s, i) => this.buildSeries(s, i)),
        // Phantom series — holds markArea overlays, always invisible
        {
          id: 'rangeOverlay',
          type: 'line' as const,
          yAxisIndex: 0,
          data: [],
          lineStyle: { opacity: 0 },
          itemStyle: { opacity: 0 },
          symbol: 'none',
          silent: true,
          markArea: { silent: true, data: [] },
        },
      ],
      // Zoom is mouse-wheel only (inside dataZoom). The slider is kept but hidden on every chart so
      // echarts.connect() still syncs the zoom window by matching dataZoom index across all charts.
      // filterMode 'filter' drops buckets outside the visible window, so the first visible bar is a
      // whole bucket inside the plot instead of a partial bar overlapping the y-axis.
      dataZoom: [
        { type: 'inside', filterMode: 'filter' },
        { type: 'slider', show: false, filterMode: 'filter' },
      ],
      brush: {
        xAxisIndex: 0,
        brushMode: 'multiple',
        brushStyle: TrendChartComponent.BRUSH_STYLE,
      },
    };
  }

  /** A series' axis is shown when it is toggled on, and (for marker overlays) only when the
   *  visible range actually has a non-zero value — an all-zero failure metric hides its axis. */
  private axisVisible(s: SeriesDef): boolean {
    if (!this.seriesVisible[s.key]) return false;
    return !s.hideZeroMarker || this.hasNonZeroData(s.key);
  }

  private hasNonZeroData(key: string): boolean {
    if (key === 'timeoutCount') return this.lastQueueData.some(d => (d.timeoutCount ?? 0) > 0);
    if (key === 'lag') return this.lastLagData.some(d => (d.lag ?? 0) > 0);
    return this.lastNodeData.some(d => ((d as any)[key] ?? 0) > 0);
  }

  private buildYAxes(def: ChartDef): any[] {
    let leftOff = 0;

    return def.series.map((s, i) => {
      const visible = this.axisVisible(s);
      let offset = 0;

      if (visible) {
        offset = leftOff;
        leftOff += AXIS_GAP;
      }

      return {
        type: 'value',
        id: s.key,
        show: visible,
        position: 'left',
        offset,
        min: 0,
        splitLine: { show: i === 0 },
        axisLabel: {
          color: s.color,
          fontSize: 10,
          formatter: (v: number) => this.formatSeriesValue(s.key, v),
        },
        axisLine: { show: true, lineStyle: { color: s.color } },
        axisTick: { show: true, lineStyle: { color: s.color } },
      };
    });
  }

  /** Widest left margin any chart needs for its visible y-axes — shared by all charts so their
   *  plot areas start at the same x and the synchronized crosshair lines up on screen. */
  private sharedGridLeft(): number {
    let maxGaps = 0;
    CHART_DEFS.forEach(def => {
      let gaps = 0;
      def.series.forEach(s => { if (this.axisVisible(s)) gaps += AXIS_GAP; });
      maxGaps = Math.max(maxGaps, gaps);
    });
    return Math.max(40, maxGaps + 10);
  }

  private buildGrid(_def: ChartDef): any {
    // Shared left/right across all charts so plot areas (and timeline grid lines) line up exactly.
    // containLabel:false — we size the left margin ourselves via sharedGridLeft(); letting ECharts
    // auto-fit each chart's labels would give every chart a different left and break alignment.
    return {
      left: this.sharedGridLeft(),
      right: 20,
      top: GRID_TOP,
      bottom: GRID_BOTTOM_NO_SLIDER,
      containLabel: false,
    };
  }

  private updateBrushMode(): void {
    // All charts share one brush-cursor state. We must NOT enable on some and disable on others:
    // echarts.connect() mirrors takeGlobalCursor across the group, so a "disable" on one chart
    // would propagate and kill the brush on the active chart (breaking the 2nd drag). The lock
    // to a single chart is enforced logically in onBrushEnd instead.
    const eligible = this.rangeSelectActive && this.brushDone < 2;
    this.charts.forEach(chart => {
      if (eligible) {
        chart.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: 'lineX', brushMode: 'multiple' } });
      } else {
        chart.dispatchAction({ type: 'takeGlobalCursor', key: '' });
      }
    });
  }

  /** Reset all brush/overlay state and clear visuals. Called on reset and compare-off. */
  private resetBrushState(): void {
    this.brushDone = 0;
    this.firstBrushRange = null;
    this.activeBrushChart = null;
    this.clearMarkAreas();
    this.clearNativeBrush();
    this.charts.forEach(c => c.setOption({ brush: { brushStyle: TrendChartComponent.BRUSH_STYLE } }));
  }

  private clearNativeBrush(): void {
    this.charts.forEach(c => c.dispatchAction({ type: 'brush', areas: [] }));
  }

  private applyMarkAreas(areas: { range: [number, number]; color: 'blue' | 'orange' }[]): void {
    const data = areas.map(a => [
      {
        xAxis: a.range[0],
        itemStyle: {
          color:       a.color === 'blue' ? 'rgba(84,112,198,0.15)' : 'rgba(255,152,0,0.15)',
          borderColor: a.color === 'blue' ? 'rgba(84,112,198,0.6)'  : 'rgba(255,152,0,0.7)',
          borderWidth: 1,
        },
      },
      { xAxis: a.range[1] },
    ]);
    this.charts.forEach(c => c.setOption({ series: [{ id: 'rangeOverlay', markArea: { silent: true, data } }] }));
  }

  private clearMarkAreas(): void {
    this.charts.forEach(c => c.setOption({ series: [{ id: 'rangeOverlay', markArea: { data: [] } }] }));
  }

  // ── Formatting helpers ───────────────────────────────────────────────────

  private formatSeriesValue(key: string, v: number): string {
    if (key === 'avgDurationMs') return formatAvgDuration(v);
    if (key === 'maxDurationMs') return formatDuration(v);
    if (key === 'totalDurationMs') return formatDuration(v);
    return Math.round(v).toLocaleString('en-US');
  }

  /** Looks up one metric's value at a bucket across all charts' data, applying fill semantics:
   *  zero-fill metrics report 0 for a missing/absent bucket, null-fill (durations) report null. */
  private valueAtBucket(def: SeriesDef, ts: number): number | null {
    let raw: number | null | undefined;
    if (def.key === 'timeoutCount') {
      raw = this.queueByBucket.get(ts)?.timeoutCount;
    } else if (def.key === 'lag') {
      raw = this.lagByBucket.get(ts)?.lag;
    } else {
      raw = (this.nodeByBucket.get(ts) as any)?.[def.key];
    }
    if ((raw === null || raw === undefined) && def.fillMode === 'zero') return 0;
    return raw ?? null;
  }

  /** Renders the hovered bucket as a "start - end" interval, e.g. "11 Jun, 12:04 - 12:05". */
  private formatBucketRange(startTs: number): string {
    const endTs = startTs + this.selectedIntervalMs;
    const start = new Date(startTs).toLocaleString('en-GB', { hour12: false });
    const sameDay = new Date(startTs).toDateString() === new Date(endTs).toDateString();
    const end = sameDay
      ? new Date(endTs).toLocaleTimeString('en-GB', { hour12: false })
      : new Date(endTs).toLocaleString('en-GB', { hour12: false });
    return `${start} - ${end}`;
  }
}
