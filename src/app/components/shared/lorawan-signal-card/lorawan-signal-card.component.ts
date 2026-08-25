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

import { Component, Input, OnChanges, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { WidgetContext } from "@home/models/widget-component.models";
import {
  MetricChartCardComponent,
  MetricChartSection,
} from "../metric-chart-card/metric-chart-card.component";

/**
 * Standalone, reusable LoRaWAN "Signal" widget: a card stacking RSSI and SNR
 * charts (sharing one time window) for a given device. Drop it into any
 * dashboard with a device id:
 *
 * ```html
 * <tb-lorawan-signal-card [ctx]="ctx" [deviceId]="device.id" [dark]="dark"></tb-lorawan-signal-card>
 * ```
 */
@Component({
  selector: "tb-lorawan-signal-card",
  template: `<tb-metric-chart-card [ctx]="ctx" [deviceId]="deviceId" [dark]="dark" title="Signal"
                                   [charts]="charts"></tb-metric-chart-card>`,
  standalone: true,
  imports: [CommonModule, MetricChartCardComponent],
})
export class LorawanSignalCardComponent implements OnChanges {
  /** Widget context (used to create the subscription). */
  @Input() ctx!: WidgetContext;
  /** Device to show the signal metrics for. */
  @Input() deviceId: string | null = null;
  /** Active theme. */
  @Input() dark = false;
  /** Telemetry keys for RSSI and SNR (override if your device uses other keys). */
  @Input() rssiKey = "rssi";
  @Input() snrKey = "snr";

  /**
   * RSSI on top, SNR below — both filled, no legend, with LoRaWAN explanations.
   * Held as a stable reference (rebuilt only when the keys change) so ambient
   * change detection doesn't recreate the charts and cause flicker.
   */
  charts: MetricChartSection[] = [];

  ngOnChanges(changes: SimpleChanges): void {
    // Rebuild only when the keys change (or on first init) — keeps the array
    // reference stable across ambient change detection so charts don't flicker.
    if (this.charts.length && !changes["rssiKey"] && !changes["snrKey"]) {
      return;
    }
    this.charts = [
      {
        chartTitle: "RSSI",
        info: "Received signal strength (dBm). Closer to 0 is stronger.",
        unit: "dBm",
        showLegend: false,
        fill: true,
        keys: [{ name: this.rssiKey, label: "RSSI", color: "#1e5dff" }],
      },
      {
        chartTitle: "SNR",
        info: "Signal-to-noise ratio (dB). Higher is better.",
        unit: "dB",
        showLegend: false,
        fill: true,
        keys: [{ name: this.snrKey, label: "SNR", color: "#a855f7" }],
      },
    ];
  }
}
