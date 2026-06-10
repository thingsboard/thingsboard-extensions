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
  AfterViewInit,
  Component,
  ElementRef,
  HostBinding,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { TrendPoint } from "../trend-chart/trend-chart.component";

// Register the ECharts pieces this chart uses, once. Uses the bundled ECharts
// (same dependency ThingsBoard's own charts use) — no CDN load, instant init.
echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

/** A named, coloured series for {@link LineChartComponent}. */
export interface LineChartSeries {
  /** Legend label. */
  name: string;
  /** Line colour (any CSS colour). */
  color: string;
  /** Time-series points. */
  data: TrendPoint[];
}

/**
 * Reusable multi-series line chart with visible axes, a bottom legend and a
 * themed tooltip, rendered with the bundled Apache ECharts (SVG renderer).
 * Colours come per-series; axis/grid colours follow the dashboard `--c-*`
 * tokens so it adapts to light/dark.
 */
@Component({
  selector: "tb-line-chart",
  templateUrl: "./line-chart.component.html",
  styleUrls: ["./line-chart.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class LineChartComponent implements AfterViewInit, OnChanges, OnDestroy {
  /** Strip the native `title` attribute off the host (set via `title=`) so the
   *  browser doesn't render its own tooltip over the chart. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() series: LineChartSeries[] = [];
  @Input() unit = "";
  @Input() loading = false;
  /** Active theme — drives axis/grid/tooltip colours (re-renders when toggled). */
  @Input() dark = false;
  /** Chart height (CSS length). */
  @Input() height = "220px";
  /** Optional bold heading shown above the chart. */
  @Input() title = "";
  /** Optional explanatory text shown in a hover tooltip on an info icon by the title. */
  @Input() titleInfo = "";
  /** Centred moving-average window (in points) to smooth noisy lines; <=1 = off. */
  @Input() averageWindow = 0;
  /** Downsample to at most this many points (bucket-averaged); 0 = off. */
  @Input() maxPoints = 0;
  /** Render the lines as smooth splines. */
  @Input() smooth = false;
  /** Animate draws/updates. Disable for instant rendering. */
  @Input() animated = true;
  /** Show the bottom legend (hide it for single-series charts). */
  @Input() showLegend = true;
  /** Fill the area under each line with a vertical colour gradient. */
  @Input() area = false;
  /** Charts sharing the same group sync their hover tooltip + axis pointer
   *  (like Grafana). Give every chart that should sync the same id. */
  @Input() syncGroup?: string;
  /** Force the time x-axis to span this window (epoch ms) regardless of the data
   *  extent — so e.g. a 1D chart shows the full 24h even when data is sparse. */
  @Input() xMin?: number;
  @Input() xMax?: number;

  @ViewChild("chart") chartEl?: ElementRef<HTMLElement>;

  private chart: any;
  private viewReady = false;
  private destroyed = false;
  private resizeObserver?: ResizeObserver;
  /** Series count at the last render — a change forces a full (notMerge) rebuild. */
  private lastSeriesCount = -1;
  /** While the pointer is over the chart, defer redraws so the hover tooltip +
   *  active point markers aren't wiped by a live data refresh. */
  private hovering = false;
  private pendingRender = false;
  private readonly onPointerEnter = () => {
    this.hovering = true;
  };
  private readonly onPointerLeave = () => {
    this.hovering = false;
    if (this.pendingRender) {
      this.pendingRender = false;
      this.render();
    }
  };

  /** True when no series has any finite points. */
  get isEmpty(): boolean {
    return !(this.series ?? []).some((s) => (s.data ?? []).some((p) => isFinite(Number(p.value))));
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    const el = this.chartEl?.nativeElement;
    // Re-measure when the container resizes (panel open / card expand / widget resize).
    if (el && "ResizeObserver" in window) {
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(el);
    }
    el?.addEventListener("mouseenter", this.onPointerEnter);
    el?.addEventListener("mouseleave", this.onPointerLeave);
    this.render();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      this.viewReady &&
      (changes["series"] ||
        changes["loading"] ||
        changes["dark"] ||
        changes["unit"] ||
        changes["averageWindow"] ||
        changes["maxPoints"] ||
        changes["smooth"] ||
        changes["animated"] ||
        changes["showLegend"] ||
        changes["area"] ||
        changes["xMin"] ||
        changes["xMax"])
    ) {
      this.render();
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    const el = this.chartEl?.nativeElement;
    el?.removeEventListener("mouseenter", this.onPointerEnter);
    el?.removeEventListener("mouseleave", this.onPointerLeave);
    this.chart?.dispose();
    this.chart = undefined;
  }

  /** Re-measure the canvas (call after the card is shown/resized). */
  resize(): void {
    this.chart?.resize();
  }

  private render(): void {
    const el = this.chartEl?.nativeElement;
    if (!el || this.destroyed) {
      return;
    }
    // Init the chart up front so we can show the loading spinner over an empty
    // frame (no "No data" text flash before the line arrives).
    if (!this.chart) {
      this.chart = echarts.init(el, null, { renderer: "svg" });
      // Group + connect so charts in the same group share the hover tooltip and
      // axis pointer (connect re-scans the group, linking later-created charts).
      if (this.syncGroup) {
        this.chart.group = this.syncGroup;
        echarts.connect(this.syncGroup);
      }
    }
    // Don't redraw while hovering — it would dismiss the active tooltip and the
    // hover point markers. Apply the latest data once the pointer leaves.
    if (this.hovering) {
      this.pendingRender = true;
      return;
    }

    const styles = getComputedStyle(el);
    const cssVar = (name: string) => styles.getPropertyValue(name).trim();
    const axisText = cssVar("--c-text-neutral-light");
    const axisLine = cssVar("--c-border-neutral-light");
    const splitLine = cssVar("--c-border-neutral-light");
    const tooltipBg = this.dark ? cssVar("--c-bg-neutral-light") : cssVar("--c-bg-neutral-min");
    const tooltipBorder = this.dark ? cssVar("--c-border-neutral-normal") : cssVar("--c-border-neutral-light");
    const tooltipText = cssVar("--c-text-neutral-heavy");

    // Loading state: clear any previous line and show ECharts' spinner so the
    // chart "loads then renders" rather than flashing a "No data" label.
    if (this.loading && this.isEmpty) {
      this.chart.clear();
      this.lastSeriesCount = -1;
      this.chart.showLoading("default", {
        text: "",
        color: this.dark ? cssVar("--c-icon-brand-light") : cssVar("--c-bg-brand-normal"),
        maskColor: this.hexToRgba(cssVar("--c-bg-neutral-extralight"), 0.6),
        spinnerRadius: 9,
        lineWidth: 2,
      });
      return;
    }
    this.chart.hideLoading();

    if (this.isEmpty) {
      this.chart.clear();
      this.lastSeriesCount = -1; // next non-empty render rebuilds fully
      return;
    }

    const series = (this.series ?? []).map((s) => {
      const points = (s.data ?? [])
        .map((p) => [p.ts, Number(p.value)] as [number, number])
        .filter((p) => isFinite(p[1]))
        .sort((a, b) => a[0] - b[0]);
      const data = this.movingAverage(this.downsample(points, this.maxPoints), this.averageWindow);
      const opt: any = {
        name: s.name,
        type: "line",
        // Show point markers when the series is too sparse to draw a line, so a
        // lone reading is still visible instead of appearing as "no data".
        showSymbol: data.length <= 2,
        symbolSize: 5,
        smooth: this.smooth,
        // Downsample to the plot width when there are many points (cheap render).
        sampling: "lttb",
        lineStyle: { color: s.color, width: 1.5 },
        itemStyle: { color: s.color },
        data,
      };
      if (this.area) {
        opt.areaStyle = {
          // Always fill down to the axis baseline (not toward y=0), so negative
          // series like RSSI still fill to the bottom of the chart.
          origin: "start",
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: this.hexToRgba(s.color, 0.6) },
              { offset: 1, color: this.hexToRgba(s.color, 0.1) },
            ],
          },
        };
      }
      return opt;
    });

    this.chart.setOption(
      {
        // Animation settings copied from ThingsBoard's time-series chart
        // (chart.models.ts → chartAnimationDefaultSettings). animationThreshold
        // auto-disables animation past 2000 points so big series stay snappy.
        animation: this.animated,
        animationThreshold: 2000,
        animationDuration: 500,
        animationEasing: "cubicOut",
        animationDelay: 0,
        animationDurationUpdate: 300,
        animationEasingUpdate: "cubicOut",
        animationDelayUpdate: 0,
        color: series.map((s) => s.itemStyle.color),
        grid: { left: 8, right: 12, top: 12, bottom: this.showLegend ? 28 : 8, containLabel: true },
        legend: {
          show: this.showLegend,
          bottom: 0,
          icon: "roundRect",
          itemWidth: 14,
          itemHeight: 3,
          itemGap: 18,
          textStyle: { color: axisText, fontSize: 12 },
          data: series.map((s) => s.name),
        },
        tooltip: {
          trigger: "axis",
          backgroundColor: this.hexToRgba(tooltipBg, 0.55),
          borderColor: this.hexToRgba(tooltipBorder, 0.6),
          borderWidth: 1,
          padding: [6, 10],
          textStyle: { color: tooltipText, fontSize: 12 },
          extraCssText:
            "backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border-radius: 8px; box-shadow: 0 3px 16px rgba(0, 0, 0, 0.12);",
          // Header: "May 23, 1:05 PM"; then a coloured marker + value per series.
          formatter: (params: any) => {
            const arr = Array.isArray(params) ? params : [params];
            if (!arr.length) {
              return "";
            }
            const ts = Array.isArray(arr[0].value) ? arr[0].value[0] : arr[0].axisValue;
            const header = this.formatTooltipDate(ts);
            const rows = arr
              .map((p: any) => {
                const raw = Array.isArray(p.value) ? p.value[1] : p.value;
                const val = `${Math.round(Number(raw) * 10) / 10}${this.unit ? " " + this.unit : ""}`;
                return `${p.marker}${p.seriesName} <b>${val}</b>`;
              })
              .join("<br/>");
            return `${header}<br/>${rows}`;
          },
        },
        xAxis: {
          type: "time",
          // Pin the axis to the requested window so it spans the full range even
          // when the data doesn't fill it; otherwise ECharts fits to the data.
          min: this.xMin ?? "dataMin",
          max: this.xMax ?? "dataMax",
          axisLabel: { color: axisText, fontSize: 11, hideOverlap: true },
          axisLine: { lineStyle: { color: axisLine } },
          axisTick: { show: false },
          splitLine: { show: false },
        },
        yAxis: {
          type: "value",
          scale: true,
          // Round labels to avoid floating-point artefacts (e.g. 21.900000000002).
          axisLabel: { color: axisText, fontSize: 11, formatter: (v: number) => `${Math.round(v * 10) / 10}` },
          axisLine: { show: false },
          splitLine: { lineStyle: { color: splitLine, type: "dashed" } },
        },
        series,
      },
      // Merge data updates so an active hover tooltip survives a live refresh;
      // only force a full rebuild when the series count actually changes.
      { notMerge: series.length !== this.lastSeriesCount },
    );
    this.lastSeriesCount = series.length;
  }

  /**
   * Reduce to at most `maxPoints` by grouping consecutive points into equal
   * buckets and averaging each bucket's timestamp + value. Far fewer points get
   * rendered while preserving the overall shape. Off when `maxPoints` <= 0.
   */
  private downsample(points: [number, number][], maxPoints: number): [number, number][] {
    if (!maxPoints || maxPoints <= 0 || points.length <= maxPoints) {
      return points;
    }
    const bucketSize = Math.ceil(points.length / maxPoints);
    const out: [number, number][] = [];
    for (let i = 0; i < points.length; i += bucketSize) {
      const end = Math.min(points.length, i + bucketSize);
      let sumT = 0;
      let sumV = 0;
      for (let j = i; j < end; j++) {
        sumT += points[j][0];
        sumV += points[j][1];
      }
      const n = end - i;
      out.push([sumT / n, sumV / n]);
    }
    return out;
  }

  /** Centred moving average over `window` points (returns input unchanged when off). */
  private movingAverage(points: [number, number][], window: number): [number, number][] {
    if (!window || window <= 1 || points.length < 2) {
      return points;
    }
    const half = Math.floor(window / 2);
    return points.map((p, i) => {
      const start = Math.max(0, i - half);
      const end = Math.min(points.length, i + half + 1);
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += points[j][1];
      }
      return [p[0], sum / (end - start)] as [number, number];
    });
  }

  /** Format a timestamp as "May 23, 1:05 PM" (month day, then 12-hour time). */
  private formatTooltipDate(ts: number): string {
    const d = new Date(ts);
    const date = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
    return `${date}, ${time}`;
  }

  /** Convert a #rgb/#rrggbb colour to rgba() with the given alpha (passthrough otherwise). */
  private hexToRgba(color: string, alpha: number): string {
    const hex = (color || "").trim().replace("#", "");
    let r: number;
    let g: number;
    let b: number;
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      return color;
    }
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
