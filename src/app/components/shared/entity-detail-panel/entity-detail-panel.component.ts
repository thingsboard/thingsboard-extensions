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

import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { DetailPanelComponent } from "../detail-panel/detail-panel.component";
import { SegmentOption, SegmentedControlComponent } from "../segmented-control/segmented-control.component";

/** Default tab set: Insights / Alarms / Settings (icon pills with tooltips). */
const DEFAULT_TABS: SegmentOption[] = [
  { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
  { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms" },
  { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
];

/**
 * Reusable right-side entity detail panel: a {@link DetailPanelComponent} with a
 * summary header (icon badge + name + subtitle) and an icon pill group that
 * switches between Insights / Alarms / Settings views.
 *
 * Consumers project per-tab content into the named slots; Alarms and Settings
 * fall back to a built-in "coming soon" placeholder when nothing is projected.
 *
 * ```html
 * <tb-entity-detail-panel [open]="open" [name]="device.name" [subtitle]="device.id"
 *                         (closed)="open = false">
 *   <div insights>…dashboard-specific content…</div>
 * </tb-entity-detail-panel>
 * ```
 */
@Component({
  selector: "tb-entity-detail-panel",
  templateUrl: "./entity-detail-panel.component.html",
  styleUrls: ["./entity-detail-panel.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, DetailPanelComponent, SegmentedControlComponent],
})
export class EntityDetailPanelComponent implements OnChanges {
  /** Whether the panel is open (slid in). */
  @Input() open = false;
  /** Icon shown in the header summary badge. */
  @Input() icon = "sensors";
  /** Primary header line (e.g. the entity's display name). */
  @Input() name = "";
  /** Secondary header line under the name (e.g. the entity's id / MAC). */
  @Input() subtitle = "";
  /** Tab options; defaults to Insights / Alarms / Settings. */
  @Input() tabs: SegmentOption[] = DEFAULT_TABS;
  /** Show a click-to-dismiss backdrop (closes the panel on click-off). */
  @Input() dismissible = false;
  /** Drop the body's top padding so content starts flush under the header. */
  @Input() flushBody = false;

  /** Emitted when the panel is closed. */
  @Output() closed = new EventEmitter<void>();

  /** Currently selected tab id. */
  activeTab = DEFAULT_TABS[0].id;

  ngOnChanges(changes: SimpleChanges): void {
    // Reset to the first tab each time the panel is opened.
    if (changes["open"]?.currentValue) {
      this.activeTab = this.tabs[0]?.id ?? "insights";
    }
  }
}
