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

/**
 * Themed boolean toggle switch (pill track + sliding thumb) matching the
 * dashboard `--c-*` tokens. Implements ControlValueAccessor so it works with
 * `formControlName`. Prefixed `tb-ext-` to avoid colliding with ThingsBoard's
 * own switch component.
 */
@Component({
  selector: "tb-ext-switch",
  templateUrl: "./switch.component.html",
  styleUrls: ["./switch.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SwitchComponent), multi: true }],
})
export class SwitchComponent implements ControlValueAccessor {
  @Input() label = "";
  /** Render the label as a bold option header. */
  @Input() heading = false;

  value = false;
  disabled = false;

  private onChange: (value: boolean) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  toggle(): void {
    if (this.disabled) {
      return;
    }
    this.value = !this.value;
    this.onChange(this.value);
    this.onTouched();
  }

  // -- ControlValueAccessor ---------------------------------------------------
  writeValue(value: boolean): void {
    this.value = !!value;
  }
  registerOnChange(fn: (value: boolean) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
