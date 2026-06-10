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

import { Component, HostBinding, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/**
 * Small brand-blue info icon with a themed hover tooltip (same pill style as the
 * chart info icons), opening above. `align` controls which way the tooltip
 * extends from the icon so it stays inside a narrow panel ("left" = extends
 * right from the icon, "right" = extends left).
 */
@Component({
  selector: "tb-info-icon",
  templateUrl: "./info-icon.component.html",
  styleUrls: ["./info-icon.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class InfoIconComponent {
  /** Strip the reflected native `title` so the browser shows no tooltip. */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** Tooltip text. */
  @Input() text = "";
  /** Tooltip extend direction from the icon. */
  @Input() align: "left" | "right" = "left";
}
