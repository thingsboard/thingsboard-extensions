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

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/**
 * Monospace value chip whose whole surface is a copy-to-clipboard button. The
 * copy icon fades in on hover; on click the value is copied and the icon turns
 * into a green ✓ for a short while. Styling uses the dashboard's `--c-*` theme
 * tokens (inherited from an ancestor), so it adapts to light/dark.
 */
@Component({
  selector: "tb-copy-box",
  templateUrl: "./copy-box.component.html",
  styleUrls: ["./copy-box.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CopyBoxComponent {
  /** Text shown in the box. */
  @Input() value = "";
  /** Text actually copied to the clipboard (defaults to {@link value}). */
  @Input() copyValue?: string;
  /** Stretch the box to fill its container instead of hugging its content. */
  @Input() fullWidth = false;
  /** Grey the value text (e.g. to indicate a read-only field). */
  @Input() muted = false;
  /** Match the height/padding of the form text inputs (taller than the chip default). */
  @Input() inputSized = false;
  /**
   * Fixed box width (any CSS length, e.g. "140px"). Keeps the box a stable size
   * regardless of the value's length — useful when the value changes (e.g. unit
   * switches) so the box doesn't grow or shrink.
   */
  @Input() width?: string;
  /** Milliseconds the ✓ confirmation stays visible. */
  @Input() copiedDuration = 1500;

  copied = false;

  constructor(private readonly cd: ChangeDetectorRef) {}

  copy(): void {
    const text = this.copyValue ?? this.value;
    if (!text || !navigator?.clipboard || this.copied) {
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      this.copied = true;
      this.cd.markForCheck();
      setTimeout(() => {
        this.copied = false;
        this.cd.markForCheck();
      }, this.copiedDuration);
    });
  }
}
