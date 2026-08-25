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

import { Component, Input, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { SharedModule } from "@shared/public-api";

/** An option in a {@link ButtonGroupComponent}. */
export interface ButtonGroupOption {
  value: string;
  label: string;
  /** Optional hover tooltip. */
  tooltip?: string;
}

/**
 * Themed single-select button group (a row of outlined boxes where the selected
 * one is highlighted with the brand-blue border / text — same look as the radio
 * "Channel Width" control). Implements ControlValueAccessor so it works with
 * `formControlName` / `[(ngModel)]`.
 */
@Component({
  selector: "tb-button-group",
  templateUrl: "./button-group.component.html",
  styleUrls: ["./button-group.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ButtonGroupComponent), multi: true }],
})
export class ButtonGroupComponent implements ControlValueAccessor {
  @Input() options: ButtonGroupOption[] = [];

  value: string | null = null;
  disabled = false;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  select(option: ButtonGroupOption): void {
    if (this.disabled || option.value === this.value) {
      return;
    }
    this.value = option.value;
    this.onChange(option.value);
    this.onTouched();
  }

  // -- ControlValueAccessor ---------------------------------------------------
  writeValue(value: string | null): void {
    this.value = value;
  }
  registerOnChange(fn: (value: string | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
