import { ChangeDetectorRef, Component, Input, Injector, OnChanges, SimpleChanges, OnDestroy } from '@angular/core';
import { combineLatest, Subscription } from 'rxjs';
import { CompareState, FilterState, MergedStatsDelta, MergedStatsTableRow } from './rule-engine-monitoring.models';
import { RuleEngineMonitoringWidgetService, RuleEngineHttpError } from './rule-engine-monitoring.service';
import { comparisonLabel, formatAvgDuration, formatDuration, METRIC_POLARITY } from './rule-engine-monitoring.utils';

interface KpiMetrics {
  totalExecs: number;
  totalErrors: number;
  successRate: number;
  timeoutCount: number;
  avgDurationMs: number;
  totalDurationMs: number;
}

interface KpiCard {
  key: string;
  label: string;
  primaryValue: string;      // compareValue (or raw value in non-compare mode)
  beforeValue: string | null; // "Before: {baseValue}"
  deltaLabel: string | null;  // "Δ +123 (+12.3%)" / "Δ +16,120" / null
  deltaColour: 'green' | 'red' | 'neutral' | null;
}

@Component({
  selector: 'tb-rem-kpi-cards',
  templateUrl: './kpi-cards.component.html',
  styleUrls: ['./kpi-cards.component.scss'],
  standalone: false
})
export class KpiCardsComponent implements OnChanges, OnDestroy {

  @Input() filterState: FilterState | null = null;
  @Input() compareState: CompareState | null = null;
  @Input() injector: Injector | null = null;

  cards: KpiCard[] = [];
  loading = false;
  errorMessage: string | null = null;

  /** Short per-metric explanations, shown when the info icon on a card is pressed. */
  readonly cardDescriptions: Record<string, string> = {
    totalExecs:          'Total number of rule node executions in the selected time range.',
    totalFailedExecs:    'Number of rule node executions that ended with an error.',
    successRate:         'Share of executions that completed without error (successful ÷ total).',
    queueTimeoutCount:   'Number of timed-out messages during processing',
    currentQueueLag:     'Last-known sum lag across queues',
    avgDuration:         'Average time a rule node took to process a single message.',
    totalProcessingTime: 'Sum of all rule node execution durations over the selected range.',
  };

  private service: RuleEngineMonitoringWidgetService | null = null;
  private sub: Subscription | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  /** Blocking spinner only on the very first load; later refreshes update in place. */
  get initialLoading(): boolean {
    return this.loading && this.cards.length === 0;
  }

  trackByCard(_: number, card: KpiCard): string {
    return card.key;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['injector'] && this.injector && !this.service) {
      this.service = new RuleEngineMonitoringWidgetService(this.injector);
    }
    if ((changes['filterState'] || changes['compareState']) && this.filterState && this.service) {
      this.fetch();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  private fetch(): void {
    this.sub?.unsubscribe();
    this.errorMessage = null;
    this.loading = true;
    this.cdr.detectChanges();

    // Current queue lag is the last-known total — independent of the selected/compare range,
    // shown as a single value with no before/after/delta even in compare mode.
    const lag$ = this.service!.getCurrentQueueLag();

    // Compare mode active but no range brushed yet — show N/A metrics, but still surface current lag
    if (this.compareState !== null && this.compareState.baseRange === null) {
      this.sub = lag$.subscribe({
        next: (lag: number) => {
          this.cards = this.buildCards(this.naMetrics(), null, lag);
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err: RuleEngineHttpError) => this.handleError(err)
      });
      return;
    }

    const filter: FilterState = this.compareState?.baseRange
      ? { ...this.filterState!, startTs: this.compareState.baseRange.startTs, endTs: this.compareState.baseRange.endTs }
      : this.filterState!;
    const cmpFilter: FilterState | undefined = this.compareState?.compareRange
      ? { ...this.filterState!, startTs: this.compareState.compareRange.startTs, endTs: this.compareState.compareRange.endTs }
      : undefined;

    if (cmpFilter) {
      this.sub = combineLatest([this.service!.getStatsTableCompare(filter, cmpFilter), lag$]).subscribe({
        next: ([deltaRows, lag]: [MergedStatsDelta[], number]) => {
          this.cards = this.buildCards(
            this.computeMetrics(deltaRows.map(r => this.toBaseRow(r))),
            this.computeMetrics(deltaRows.map(r => this.toCompareRow(r))),
            lag
          );
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err: RuleEngineHttpError) => this.handleError(err)
      });
    } else {
      this.sub = combineLatest([this.service!.getStatsTable(filter), lag$]).subscribe({
        next: ([rows, lag]: [MergedStatsTableRow[], number]) => {
          this.cards = this.buildCards(this.computeMetrics(rows), null, lag);
          this.loading = false;
          this.cdr.detectChanges();
        },
        error: (err: RuleEngineHttpError) => this.handleError(err)
      });
    }
  }

  private toBaseRow(r: MergedStatsDelta): MergedStatsTableRow {
    return {
      queueId: r.queueId, ruleChainId: r.ruleChainId, ruleNodeId: r.ruleNodeId, serviceId: r.serviceId,
      execCount: r.execCount.baseValue, errorCount: r.errorCount.baseValue,
      totalDurationMs: r.totalDurationMs.baseValue, avgDurationMs: r.avgDurationMs.baseValue,
      maxDurationMs: r.maxDurationMs.baseValue,
      p95DurationMs: r.p95DurationMs.baseValue, timeoutCount: r.timeoutCount.baseValue,
    };
  }

  private toCompareRow(r: MergedStatsDelta): MergedStatsTableRow {
    return {
      queueId: r.queueId, ruleChainId: r.ruleChainId, ruleNodeId: r.ruleNodeId, serviceId: r.serviceId,
      execCount: r.execCount.compareValue, errorCount: r.errorCount.compareValue,
      totalDurationMs: r.totalDurationMs.compareValue, avgDurationMs: r.avgDurationMs.compareValue,
      maxDurationMs: r.maxDurationMs.compareValue,
      p95DurationMs: r.p95DurationMs.compareValue, timeoutCount: r.timeoutCount.compareValue,
    };
  }

  private computeMetrics(rows: MergedStatsTableRow[]): KpiMetrics {
    let execSum = 0;
    let errorSum = 0;
    let durSum = 0;
    let toSum = 0;
    for (const row of rows) {
      execSum  += row.execCount       ?? 0;
      errorSum += row.errorCount      ?? 0;
      durSum   += row.totalDurationMs ?? 0;
      toSum    += row.timeoutCount    ?? 0;
    }

    return {
      totalExecs:      execSum,
      totalErrors:     errorSum,
      totalDurationMs: durSum,
      timeoutCount:    toSum,
      successRate:     execSum > 0 ? (execSum - errorSum) / execSum * 100 : 0,
      avgDurationMs:   execSum > 0 ? durSum / execSum : 0,
    };
  }

  private buildCards(current: KpiMetrics, compare: KpiMetrics | null, currentLag: number): KpiCard[] {
    const fmtNum  = (v: number | null): string => (v ?? 0).toLocaleString();
    const fmtDur  = (v: number | null): string => formatDuration(v ?? 0);
    const fmtRate = (v: number | null): string => `${(v ?? 0).toFixed(1)}%`;

    const card = (
      key: string,
      label: string,
      cur: number | null,
      cmp: number | null | undefined,
      fmt: (v: number | null) => string
    ): KpiCard => {
      if (compare === null) {
        return { key, label, primaryValue: fmt(cur), beforeValue: null, deltaLabel: null, deltaColour: null };
      }

      const base = (cur === null || isNaN(cur as number)) ? 0 : cur as number;
      const comp = (cmp === null || cmp === undefined || isNaN(cmp as number)) ? 0 : cmp as number;
      const lowerIsBetter = METRIC_POLARITY[key] ?? true;

      if (base === 0 && comp === 0) {
        return { key, label, primaryValue: fmt(0), beforeValue: `Before: ${fmt(0)}`, deltaLabel: null, deltaColour: null };
      }

      if (base === 0) {
        const colour = lowerIsBetter ? 'red' : 'green';
        return { key, label, primaryValue: fmt(comp), beforeValue: `Before: ${fmt(0)}`, deltaLabel: `Δ +${fmt(comp)}`, deltaColour: colour };
      }

      const delta  = comp - base;
      const pct    = delta / base * 100;
      const colour = delta === 0 ? 'neutral' : comparisonLabel(pct, lowerIsBetter).colour;
      const sign   = delta > 0 ? '+' : '-';
      const deltaLabel = delta === 0
        ? null
        : `Δ ${sign}${fmt(Math.abs(delta))} (${delta > 0 ? '+' : ''}${pct.toFixed(1)}%)`;

      return { key, label, primaryValue: fmt(comp), beforeValue: `Before: ${fmt(base)}`, deltaLabel, deltaColour: colour };
    };

    // Current queue lag has no before/after/delta even in compare mode (excluded from comparison),
    // so it is rendered as a plain single value via null before/delta fields.
    const lagCard: KpiCard = {
      key: 'currentQueueLag', label: 'Current Queue Lag', primaryValue: fmtNum(currentLag),
      beforeValue: null, deltaLabel: null, deltaColour: null,
    };

    return [
      card('totalExecs',        'Total Rule Node Executions',          current.totalExecs,    compare?.totalExecs,    fmtNum),
      card('totalFailedExecs',  'Total Rule Node Failed Executions',   current.totalErrors,   compare?.totalErrors,   fmtNum),
      card('successRate',       'Rule Node Success Rate',    current.successRate,   compare?.successRate,   fmtRate),
      card('queueTimeoutCount', this.timeoutLabel(),         current.timeoutCount,  compare?.timeoutCount,  fmtNum),
      lagCard,
      card('avgDuration',       'Avg Rule Node Execution Duration',    current.avgDurationMs, compare?.avgDurationMs, (v) => formatAvgDuration(v ?? 0)),
      card('totalProcessingTime','Total Rule Node Execution Duration',    current.totalDurationMs, compare?.totalDurationMs, fmtDur),
    ];
  }

  /** Tooltip text for a card. The queue-timeout metric changes meaning when a rule chain/node is
   *  selected — timeouts are then grouped by the last rule node visited before the timeout. */
  cardDescription(key: string): string | null {
    if (key === 'queueTimeoutCount' && this.timeoutLastNode()) {
      return 'When a timeout occurs, it is attributed to the last rule node visited before the timeout. '
        + 'Counts are grouped by that last-visited rule node.';
    }
    return this.cardDescriptions[key] ?? null;
  }

  /** When a rule chain or rule node is selected, queue timeouts are counted as hits on the last
   *  node, so the metric is relabelled accordingly. */
  private timeoutLabel(): string {
    return this.timeoutLastNode() ? 'Queue Timeout Last-Node Hits' : 'Queue Timeout Count';
  }

  private timeoutLastNode(): boolean {
    const fs = this.filterState;
    return !!fs && ((fs.ruleChainIds?.length ?? 0) > 0 || (fs.ruleNodeIds?.length ?? 0) > 0);
  }

  private handleError(err: RuleEngineHttpError): void {
    this.loading = false;
    this.errorMessage = err?.status === 401 || err?.status === 403
      ? 'Access denied. Please log in with sufficient permissions.'
      : 'Failed to load metrics.';
    this.cdr.detectChanges();
  }

  private naMetrics(): KpiMetrics {
    return { totalExecs: 0, totalErrors: 0, successRate: 0, timeoutCount: 0, avgDurationMs: 0, totalDurationMs: 0 };
  }
}
