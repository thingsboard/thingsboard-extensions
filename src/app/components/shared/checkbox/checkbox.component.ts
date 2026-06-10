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
import { InfoIconComponent } from "../info-icon/info-icon.component";

/**
 * Themed boolean checkbox: a square box (brand-blue fill + white check when on)
 * followed by a label — the UniFi-style toggle used in the device settings.
 * Implements ControlValueAccessor so it works with `formControlName`.
 */
@Component({
  // Prefixed `tb-ext-` because ThingsBoard's SharedModule already ships a
  // `tb-checkbox` component (a plain `tb-checkbox` selector collides → NG0300).
  selector: "tb-ext-checkbox",
  templateUrl: "./checkbox.component.html",
  styleUrls: ["./checkbox.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, InfoIconComponent],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CheckboxComponent), multi: true }],
})
export class CheckboxComponent implements ControlValueAccessor {
  @Input() label = "";
  /** Optional info-icon tooltip text shown after the label. */
  @Input() info = "";
  /** Direction the info tooltip extends (so it stays inside a narrow panel). */
  @Input() infoAlign: "left" | "right" = "left";
  /** Render the label as a bold option header (stands out from plain toggles). */
  @Input() heading = false;
  /**
   * Tri-state mode (for bulk editing): the value cycles `null` (unchanged,
   * indeterminate dash) → `true` (on) → `false` (off). In normal mode the value
   * is a plain boolean that toggles on/off.
   */
  @Input() triState = false;

  /** `true` = on, `false` = off, `null` = unchanged (tri-state only). */
  value: boolean | null = false;
  disabled = false;

  private onChange: (value: boolean | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  toggle(): void {
    if (this.disabled) {
      return;
    }
    if (this.triState) {
      // unchanged -> on -> off -> unchanged
      this.value = this.value === null ? true : this.value === true ? false : null;
    } else {
      this.value = !this.value;
    }
    this.onChange(this.value);
    this.onTouched();
  }

  // -- ControlValueAccessor ---------------------------------------------------
  writeValue(value: boolean | null): void {
    this.value = this.triState ? (value == null ? null : !!value) : !!value;
  }
  registerOnChange(fn: (value: boolean | null) => void): void {
    this.onChange = fn;
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }
  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
