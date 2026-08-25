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

/** A tab in the {@link TabBarComponent}. */
export interface TabItem {
  id: string;
  label: string;
  icon: string;
}

/**
 * TTS-style tab strip: icon + label tabs with an animated underline (grows from
 * the centre on hover, solid brand for the active tab). Reflects {@link active}
 * and emits {@link activeChange}.
 */
@Component({
  selector: "tb-tab-bar",
  templateUrl: "./tab-bar.component.html",
  styleUrls: ["./tab-bar.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
})
export class TabBarComponent {
  @Input() tabs: TabItem[] = [];
  @Input() active = "";
  @Output() activeChange = new EventEmitter<string>();
}
