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

import { Component, ElementRef, Input, NgZone, OnDestroy, forwardRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from "@angular/forms";
import { SharedModule } from "@shared/public-api";

/** An option in a {@link SelectComponent}. */
export interface TbSelectOption {
  value: string;
  label: string;
}

/**
 * Themed dropdown select that matches the dashboard `--c-*` tokens (the native
 * `<select>` popup can't be styled, and mat-select's overlay renders outside the
 * themed dashboard root). Implements ControlValueAccessor so it works with
 * `formControlName` / `[(ngModel)]`.
 */
@Component({
  selector: "tb-select",
  templateUrl: "./select.component.html",
  styleUrls: ["./select.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SelectComponent), multi: true }],
})
export class SelectComponent implements ControlValueAccessor, OnDestroy {
  /** The currently-open select (only one may be open at a time, app-wide). */
  private static openInstance: SelectComponent | null = null;

  @Input() options: TbSelectOption[] = [];
  @Input() placeholder = "";

  value: string | null = null;
  open = false;
  disabled = false;

  private onChange: (value: string | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor(private host: ElementRef<HTMLElement>, private zone: NgZone) {
    // Capture-phase document listener: fires top-down, so it isn't swallowed by
    // a bubbling-phase stopPropagation() in the detail panel / dashboard. Closes
    // the panel on any pointerdown outside this component.
    this.zone.runOutsideAngular(() => {
      document.addEventListener("pointerdown", this.onDocumentPointerDown, true);
    });
  }

  ngOnDestroy(): void {
    document.removeEventListener("pointerdown", this.onDocumentPointerDown, true);
  }

  /** Label of the currently selected option, or the placeholder. */
  get selectedLabel(): string {
    return this.options.find((o) => o.value === this.value)?.label ?? this.placeholder;
  }

  get hasValue(): boolean {
    return this.options.some((o) => o.value === this.value);
  }

  toggle(): void {
    if (this.disabled) {
      return;
    }
    if (this.open) {
      this.close();
    } else {
      // Close any other open select so we never have overlapping panels.
      SelectComponent.openInstance?.close();
      this.open = true;
      SelectComponent.openInstance = this;
    }
  }

  select(option: TbSelectOption): void {
    this.value = option.value;
    this.onChange(option.value);
    this.onTouched();
    this.close();
  }

  /** Close this select's panel (and clear the app-wide open reference). */
  private close(): void {
    this.open = false;
    if (SelectComponent.openInstance === this) {
      SelectComponent.openInstance = null;
    }
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

  /** Close the panel when clicking anywhere outside the component. */
  private readonly onDocumentPointerDown = (event: Event): void => {
    if (this.open && !this.host.nativeElement.contains(event.target as Node)) {
      // Listener runs outside Angular — re-enter so the close repaints.
      this.zone.run(() => this.close());
    }
  };
}
