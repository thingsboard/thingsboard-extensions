///
/// Copyright © 2016-2025 The Thingsboard Authors
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///

import {
  ChangeDetectorRef,
  Component,
  DestroyRef,
  HostBinding,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { WidgetSubscriptionOptions } from "@core/public-api";
import {
  AggregationType,
  AliasFilterType,
  DataKeyType,
  Datasource,
  DatasourceType,
  EntityFilter,
  EntityType,
  RealtimeWindow,
  RealtimeWindowType,
  SharedModule,
  Timewindow,
  TimewindowType,
  widgetType,
} from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { CollapsibleCardComponent } from "../collapsible-card/collapsible-card.component";
import { SegmentOption, SegmentedControlComponent } from "../segmented-control/segmented-control.component";
import { LineChartComponent, LineChartSeries, LineChartThreshold } from "../line-chart/line-chart.component";

/** Per-instance counter so each card's stacked charts get a unique sync group. */
let cardSeq = 0;

/** A telemetry series to plot in a {@link MetricChartCardComponent}. */
export interface MetricChartKey {
  /** Telemetry key name. */
  name: string;
  /** Legend label. */
  label: string;
  /** Line colour. */
  color: string;
}

/** One stacked chart within a {@link MetricChartCardComponent}. */
export interface MetricChartSection {
  /** Caption shown above the chart. */
  chartTitle?: string;
  /** Optional explanatory text shown in a hover-info tooltip by the caption. */
  info?: string;
  /** Value unit (e.g. "°C", "dBm"). */
  unit?: string;
  /** Telemetry keys plotted in this chart. */
  keys: MetricChartKey[];
  /** Show the legend (default true). */
  showLegend?: boolean;
  /** Fill the area under the line(s) with a gradient. */
  fill?: boolean;
  /** Baseline y-axis range; the axis expands past it when data falls outside. */
  yMin?: number;
  yMax?: number;
  /** Horizontal reference lines (e.g. alarm thresholds). */
  thresholds?: LineChartThreshold[];
}

/**
 * Reusable "metric chart" card: a collapsible card with a 1H/1D/1W time picker
 * over one or more stacked line charts (separated by a divider). A single
 * native ThingsBoard timeseries subscription feeds every chart, so they all
 * share the selected window. History + live websocket updates + server-side AVG
 * aggregation, with per-(device,window) caching and a loading spinner that
 * stays up until data arrives.
 */
@Component({
  selector: "tb-metric-chart-card",
  templateUrl: "./metric-chart-card.component.html",
  styleUrls: ["./metric-chart-card.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CollapsibleCardComponent, SegmentedControlComponent, LineChartComponent],
})
export class MetricChartCardComponent implements OnChanges, OnDestroy {
  /**
   * Strip the native `title` attribute off the host: the `title` @Input is set
   * via `title="…"`, but `title` is also a global HTML attribute, so the browser
   * would otherwise render its own tooltip with that text.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** Widget context (used to create the subscription). */
  @Input() ctx!: WidgetContext;
  /** Entity (device) to plot; null tears the chart subscription down. */
  @Input() deviceId: string | null = null;
  /** Card title. */
  @Input() title = "Metrics";
  /** Active theme. */
  @Input() dark = false;
  /** Stacked charts to render (each shares the card's time window). */
  @Input() charts: MetricChartSection[] = [];

  /** Per-section series, parallel to {@link charts}. */
  sectionSeries: LineChartSeries[][] = [];
  /** Window bounds (epoch ms) so each chart's x-axis spans the full timeframe. */
  windowStart?: number;
  windowEnd?: number;
  /** Unique group so this card's stacked charts share their hover line. */
  readonly syncGroup = `mcc-sync-${++cardSeq}`;
  loading = false;
  timeframe = "1D";
  readonly timeframeOptions: SegmentOption[] = [
    { id: "1D", label: "1D" },
    { id: "1W", label: "1W" },
    { id: "1M", label: "1M" },
  ];
  private readonly windowByTf: Record<string, number> = {
    "1D": 24 * 60 * 60 * 1000,
    "1W": 7 * 24 * 60 * 60 * 1000,
    "1M": 30 * 24 * 60 * 60 * 1000,
  };
  // AVG bin size per window. Windows without an entry fetch raw (unaggregated)
  // data; 1M is aggregated to 1-day bins (30 days of raw points is too dense).
  private readonly binByTf: Record<string, number> = {
    "1M": 24 * 60 * 60 * 1000, // 1 day
  };

  private subscription?: any;
  private readonly cache = new Map<string, { series: LineChartSeries[][]; start?: number; end?: number }>();
  private loadTimeout?: any;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["deviceId"]) {
      if (this.deviceId) {
        this.open(this.deviceId);
      } else {
        this.teardown();
      }
    }
  }

  ngOnDestroy(): void {
    this.teardown();
  }

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  /** Track stacked charts by position so ambient CD doesn't recreate them. */
  trackBySection(index: number): number {
    return index;
  }

  /** Change the chart window — retunes the live subscription. */
  setTimeframe(tf: string): void {
    if (this.timeframe === tf) {
      return;
    }
    this.timeframe = tf;
    // Provisional bounds so the axis spans the new window immediately, even
    // before fresh data arrives (refined from the subscription in onUpdated).
    this.setComputedWindow();
    if (this.deviceId) {
      const cached = this.cache.get(`${this.deviceId}:${tf}`);
      if (cached) {
        this.sectionSeries = cached.series;
        this.windowStart = cached.start;
        this.windowEnd = cached.end;
        this.stopLoading();
      } else {
        this.sectionSeries = [];
        this.startLoading();
      }
    }
    if (this.subscription) {
      this.subscription.updateTimewindowConfig(this.buildTimewindow());
    }
  }

  private open(deviceId: string): void {
    // Keep the currently-selected timeframe across device switches (don't reset
    // to the default), so the chosen window persists when browsing devices.
    this.setComputedWindow();
    // Show cached data instantly (one-time wait); only spin while uncached.
    const cached = this.cache.get(`${deviceId}:${this.timeframe}`);
    if (cached) {
      this.sectionSeries = cached.series;
      this.windowStart = cached.start;
      this.windowEnd = cached.end;
      this.stopLoading();
    } else {
      this.sectionSeries = [];
      this.startLoading();
    }
    this.removeSubscription();

    // One subscription over the union of every chart's keys (deduped).
    const seen = new Set<string>();
    const dataKeys: any[] = [];
    for (const section of this.charts) {
      for (const k of section.keys) {
        if (!seen.has(k.name)) {
          seen.add(k.name);
          dataKeys.push({ name: k.name, label: k.label, type: DataKeyType.timeseries, color: k.color, settings: {} });
        }
      }
    }

    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "metric-chart",
        entityFilter: {
          type: AliasFilterType.singleEntity,
          singleEntity: { entityType: EntityType.DEVICE, id: deviceId },
        } as EntityFilter,
        dataKeys,
      },
    ];

    const options: WidgetSubscriptionOptions = {
      type: widgetType.timeseries,
      datasources,
      // singleEntity + ignoreDataUpdateOnIntervalTick are the same combination
      // TB's native chart widgets use to keep long realtime windows snappy:
      // single-entity bypasses the entity-data pagination path, and the
      // ignore-tick flag stops the data aggregator from re-emitting the whole
      // window on every interval tick.
      singleEntity: true,
      useDashboardTimewindow: false,
      timeWindowConfig: this.buildTimewindow(),
      ignoreDataUpdateOnIntervalTick: true,
      callbacks: {
        onDataUpdated: (subscription) => this.onUpdated(subscription),
      },
    };

    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => {
        this.subscription = subscription;
      });
  }

  private onUpdated(subscription: any): void {
    const data: any[] = subscription?.data ?? [];
    const sectionSeries: LineChartSeries[][] = this.charts.map((section) =>
      section.keys.map((k) => {
        const d = data.find((dd) => dd.dataKey?.name === k.name);
        return {
          name: k.label,
          color: k.color,
          data: (d?.data ?? [])
            .map((p: any[]) => ({ ts: p[0], value: Number(p[1]) }))
            .filter((p: { value: number }) => isFinite(p.value)),
        };
      }),
    );
    // Prefer the subscription's authoritative window bounds; fall back to the
    // computed window. This pins the x-axis to the full timeframe.
    const tw = subscription?.timeWindow;
    if (tw?.minTime && tw?.maxTime) {
      this.windowStart = tw.minTime;
      this.windowEnd = tw.maxTime;
    } else {
      this.setComputedWindow();
    }
    // The subscription fires an initial empty update; ignore empty emissions and
    // keep the spinner up until real data arrives (the timeout covers no-data).
    const hasData = sectionSeries.some((secs) => secs.some((s) => s.data.length > 0));
    if (hasData) {
      this.sectionSeries = sectionSeries;
      this.stopLoading();
      if (this.deviceId) {
        this.cache.set(`${this.deviceId}:${this.timeframe}`, {
          series: sectionSeries,
          start: this.windowStart,
          end: this.windowEnd,
        });
      }
      this.cd.detectChanges();
    }
  }

  /** Set window bounds from the current timeframe (end = now, start = now − N). */
  private setComputedWindow(): void {
    const windowMs = this.windowByTf[this.timeframe] ?? this.windowByTf["1W"];
    this.windowEnd = Date.now();
    this.windowStart = this.windowEnd - windowMs;
  }

  /**
   * REALTIME "last N" window. Windows with a {@link binByTf} entry are AVG-binned
   * at that interval (e.g. 1M → 1-day bins); the rest fetch raw data.
   */
  private buildTimewindow(): Timewindow {
    const windowMs = this.windowByTf[this.timeframe] ?? this.windowByTf["1W"];
    const interval = this.binByTf[this.timeframe];
    const realtime: RealtimeWindow = {
      realtimeType: RealtimeWindowType.LAST_INTERVAL,
      timewindowMs: windowMs,
    };
    if (interval) {
      realtime.interval = interval;
    }
    return {
      selectedTab: TimewindowType.REALTIME,
      realtime,
      aggregation: {
        type: interval ? AggregationType.AVG : AggregationType.NONE,
        limit: 50000,
      },
    };
  }

  private startLoading(): void {
    this.loading = true;
    clearTimeout(this.loadTimeout);
    this.loadTimeout = setTimeout(() => {
      this.loading = false;
      this.cd.detectChanges();
    }, 8000);
  }

  private stopLoading(): void {
    this.loading = false;
    clearTimeout(this.loadTimeout);
  }

  private removeSubscription(): void {
    if (this.subscription) {
      this.ctx.subscriptionApi.removeSubscription(this.subscription.id);
      this.subscription = undefined;
    }
  }

  private teardown(): void {
    this.stopLoading();
    this.removeSubscription();
    this.sectionSeries = [];
  }
}
