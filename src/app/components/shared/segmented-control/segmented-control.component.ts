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

import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SharedModule } from "@shared/public-api";

/** An option in the {@link SegmentedControlComponent}. */
export interface SegmentOption {
  id: string;
  label: string;
}

/**
 * TTS-style segmented control: a row of pill options where the selected one is
 * filled. Reflects {@link selected} and emits {@link selectedChange}.
 */
@Component({
  selector: "tb-segmented-control",
  templateUrl: "./segmented-control.component.html",
  styleUrls: ["./segmented-control.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class SegmentedControlComponent {
  @Input() options: SegmentOption[] = [];
  @Input() selected = "";
  @Output() selectedChange = new EventEmitter<string>();

  select(id: string): void {
    if (id !== this.selected) {
      this.selectedChange.emit(id);
    }
  }
}
