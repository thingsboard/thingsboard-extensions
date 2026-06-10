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

import { Component, EventEmitter, HostBinding, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/**
 * Reusable right-side detail drawer. Slides in from the right edge when
 * {@link open} is set, with a header (title + close button) and a scrolling body
 * for projected content. Themed via the inherited `--c-*` tokens.
 *
 * ```html
 * <tb-detail-panel [open]="open" [title]="name" (closed)="open = false">
 *   …detail content…
 * </tb-detail-panel>
 * ```
 */
@Component({
  selector: "tb-detail-panel",
  templateUrl: "./detail-panel.component.html",
  styleUrls: ["./detail-panel.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class DetailPanelComponent {
  /**
   * Strip the native `title` attribute off the host so the browser doesn't
   * render its own tooltip from the `title` @Input.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  /** Whether the panel is shown (slid in). */
  @Input() open = false;
  /** Header title (e.g. the selected entity's name). */
  @Input() title = "";
  /** Show a click-to-dismiss backdrop behind the panel (closes on click-off). */
  @Input() dismissible = false;

  /** Emitted when the user closes the panel (close button, Escape, or backdrop). */
  @Output() closed = new EventEmitter<void>();
}
