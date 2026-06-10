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

import { Component, EventEmitter, HostBinding, Input, OnInit, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";
import { InfoIconComponent } from "../info-icon/info-icon.component";

/**
 * Reusable collapsible card: a header (optional icon + title + chevron) that
 * toggles a projected body open/closed. Themed via the dashboard `--c-*` tokens.
 *
 * ```html
 * <tb-collapsible-card title="Key Metrics">
 *   …body…
 * </tb-collapsible-card>
 * ```
 */
@Component({
  selector: "tb-collapsible-card",
  templateUrl: "./collapsible-card.component.html",
  styleUrls: ["./collapsible-card.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, InfoIconComponent],
})
export class CollapsibleCardComponent implements OnInit {
  /**
   * Strip the native `title` attribute off the host: the `title` @Input is set
   * via `title="…"`, but `title` is also a global HTML attribute, so the browser
   * would otherwise render its own tooltip with that text.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() title = "";
  /** Optional leading Material icon. */
  @Input() icon = "";
  /** Optional info-icon tooltip shown next to the title. */
  @Input() info = "";
  /** Whether the body is expanded. */
  @Input() expanded = true;

  /** Emits the new expanded state when toggled. */
  @Output() expandedChange = new EventEmitter<boolean>();

  /**
   * Whether the body may overflow the card. Kept `false` while collapsed and
   * during the open/close animation (so the body is clipped as it grows), then
   * flipped `true` once fully expanded — otherwise overflowing children like a
   * `tb-select` dropdown panel would be cut off by the card's clip.
   */
  overflowVisible = false;

  ngOnInit(): void {
    this.overflowVisible = this.expanded;
  }

  toggle(): void {
    this.expanded = !this.expanded;
    // Re-clip immediately when collapsing; the open transition lifts the clip
    // on transitionend (see onBodyTransitionEnd).
    if (!this.expanded) {
      this.overflowVisible = false;
    }
    this.expandedChange.emit(this.expanded);
  }

  /** Lift the clip once the open animation finishes (so dropdowns can escape). */
  onBodyTransitionEnd(): void {
    if (this.expanded) {
      this.overflowVisible = true;
    }
  }
}
