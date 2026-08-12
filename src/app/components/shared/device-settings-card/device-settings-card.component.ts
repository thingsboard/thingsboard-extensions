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

import { Component, DestroyRef, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormBuilder, FormGroup } from "@angular/forms";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Observable, forkJoin } from "rxjs";
import { switchMap } from "rxjs/operators";
import { AttributeScope, EntityType, SharedModule } from "@shared/public-api";
import { WidgetContext } from "@home/models/widget-component.models";
import { SelectComponent } from "../select/select.component";
import { CopyBoxComponent } from "../copy-box/copy-box.component";
import { CollapsibleCardComponent } from "../collapsible-card/collapsible-card.component";
import { ButtonGroupComponent } from "../button-group/button-group.component";
import { CheckboxComponent } from "../checkbox/checkbox.component";
import { SliderStepperComponent } from "../slider-stepper/slider-stepper.component";
import { InfoIconComponent } from "../info-icon/info-icon.component";
import { SwitchComponent } from "../switch/switch.component";

/** A dropdown option for an {@link AttributeSelect}. */
export interface AttributeSelectOption {
  value: string;
  label: string;
  /** Optional hover tooltip (used by the `buttons`/`segmented` kinds). */
  tooltip?: string;
}

/** A select field bound to a SERVER_SCOPE attribute on the device. */
export interface AttributeSelect {
  /** Server attribute key. */
  key: string;
  /** Field label. */
  label: string;
  /** Dropdown options. */
  options: AttributeSelectOption[];
}

/**
 * A control in the optional "Device settings" card (each bound to a SHARED_SCOPE
 * attribute). `kind` picks the widget:
 *  - `toggle`    → boolean checkbox
 *  - `segmented` → single-select button group laid out in the side-by-side row
 *  - `buttons`   → single-select button group on its own (stacked) row
 *  - `select`    → themed dropdown (needs `options`)
 *  - `number`    → numeric text input
 *  - `slider`    → numeric slider + stepper box (uses `min`/`max`/`step`/`unit`)
 */
export interface DeviceSettingControl {
  kind: "toggle" | "segmented" | "buttons" | "select" | "number" | "slider";
  key: string;
  label: string;
  /**
   * Object-card fields only: bind this field to its own top-level SHARED_SCOPE
   * attribute of this name instead of a property inside the object (read from
   * `objectValues[flatKey]`, saved as its own attribute). Lets a card mix a
   * flat attribute in with an object's fields (e.g. V2 alarm reporting).
   */
  flatKey?: string;
  options?: AttributeSelectOption[];
  /** Numeric bounds / unit for the `slider` (and `number`) kinds. */
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Derive the displayed unit live from another control's value (value → unit). */
  unitFrom?: { key: string; map: Record<string, string> };
  /** Optional info-icon tooltip shown next to the label. */
  info?: string;
}

/**
 * One persistence target of a {@link DeviceSettingObject} — where (and for
 * which device hardware) the object's field values are written on save.
 */
export interface DeviceSettingObjectTarget {
  /** Attribute key written: a JSON object, or a flat value with {@link flatField}. */
  key: string;
  /** Only write this target to devices of these types (default: every device). */
  deviceTypes?: string[];
  /** Rename fields for this target: form field key → attribute property name. */
  fieldMap?: Record<string, string>;
  /** Field keys to leave out of this target's JSON object. */
  omitFields?: string[];
  /** Write this single field's value as a flat attribute instead of a JSON object. */
  flatField?: string;
}

/**
 * A SHARED_SCOPE attribute whose value is a JSON object (e.g.
 * `temperatureChn1CalibrationSettings = {"enable":false,"calibrationValue":15}`).
 * Each `field.key` is a property name inside that object.
 */
export interface DeviceSettingObject {
  /** SHARED_SCOPE attribute key holding the JSON object. */
  key: string;
  /** Object label — also the label of the gate switch. */
  label: string;
  /** Sub-fields within the object. */
  fields: DeviceSettingControl[];
  /**
   * Optional boolean sub-field key that acts as the object's enable switch
   * (rendered with the object {@link label}); the remaining fields are only shown
   * while it is on.
   */
  gateKey?: string;
  /**
   * Additional SHARED_SCOPE attribute keys that receive this object's field
   * values on save (e.g. one "Alarm reporting" card writing both channels'
   * alarm configs). Displayed values are read from {@link key} only. The same
   * attribute key may appear in several cards — its fields are merged into a
   * single object on save.
   */
  mirrorKeys?: string[];
  /**
   * Full control over where the fields are saved (overrides the default
   * "{@link key} plus {@link mirrorKeys}" targets) — supports per-device-type
   * routing, field renames, and flat-attribute targets. Displayed values still
   * come from {@link key}. Fields with `flatKey` always get an implicit flat
   * target of their own in addition to these.
   */
  targets?: DeviceSettingObjectTarget[];
}

/** A group of objects under an optional static heading (e.g. "Channel 1"). */
export interface DeviceSettingObjectGroup {
  /** Static heading shown above the objects (omit for none). */
  title?: string;
  objects: DeviceSettingObject[];
}

/** A collapsible card of SHARED_SCOPE JSON-object attributes (e.g. Calibration, Alarms). */
export interface DeviceSettingObjectCard {
  title: string;
  /** Optional info-icon tooltip next to the card title. */
  info?: string;
  groups: DeviceSettingObjectGroup[];
  /** Drop the indented left accent line on each object's fields (flat layout). */
  flatFields?: boolean;
}

/**
 * Reusable device-settings form. The displayed values are passed in as inputs
 * (pre-fetched by the parent's device query — no per-open lookup); the device is
 * only fetched/saved when the user hits Apply. Edits the device label (Name),
 * description (Note) and any SERVER_SCOPE attribute selects (e.g. sensor
 * channels). Entity-group membership is shown read-only.
 *
 * When the form is changed, floating Cancel / Apply buttons appear (bottom-right
 * of the nearest positioned ancestor — e.g. the detail panel).
 */
@Component({
  selector: "tb-device-settings-card",
  templateUrl: "./device-settings-card.component.html",
  styleUrls: ["./device-settings-card.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    SelectComponent,
    CopyBoxComponent,
    CollapsibleCardComponent,
    ButtonGroupComponent,
    CheckboxComponent,
    SliderStepperComponent,
    InfoIconComponent,
    SwitchComponent,
  ],
})
export class DeviceSettingsCardComponent implements OnChanges {
  /** Widget context (provides the device + attribute + entity-group services). */
  @Input() ctx!: WidgetContext;
  /** Device to configure. */
  @Input() deviceId: string | null = null;
  /** Pre-fetched device name (read-only Hostname). */
  @Input() hostname = "";
  /** Pre-fetched device label (Name / Alias). */
  @Input() label = "";
  /** Pre-fetched device description (Note). */
  @Input() description = "";
  /** Optional second card of attribute-backed dropdowns. */
  @Input() attributeSelects: AttributeSelect[] = [];
  /** Title for the attribute-selects card (e.g. "Sensor channels"). */
  @Input() attributeCardTitle = "";
  /** Pre-fetched attribute values, keyed by attribute key. */
  @Input() attributeValues: Record<string, string> = {};

  /** Optional card of SHARED_SCOPE device settings (toggles / buttons / etc.). */
  @Input() deviceSettings: DeviceSettingControl[] = [];
  /** Title for the device-settings card (e.g. "Device settings"). */
  @Input() deviceSettingsTitle = "";
  /** Pre-fetched device-setting values, keyed by attribute key. */
  @Input() deviceSettingsValues: Record<string, string | number | boolean> = {};

  /**
   * Optional SERVER_SCOPE attribute keys for the queued-downlink sync state.
   * When a downlink-triggering (SHARED_SCOPE) setting is saved, `apply()`
   * increments `downlinkQueueKey` by 1 and sets `syncStateKey` to false — one
   * pending downlink added. A rule chain decrements the queue on each ChirpStack
   * txack and sets syncState = true at 0. Both empty = disabled.
   */
  @Input() syncStateKey = "";
  @Input() downlinkQueueKey = "";
  /** Current downlink-queue counter value, used for the +1 increment on Apply. */
  @Input() downlinkQueue = 0;

  /**
   * Device IDs to edit in bulk. When non-empty the card hides per-device fields
   * (name/label/note/groups) and Apply writes only the user-touched settings to
   * every listed device. Empty = normal single-device mode (uses {@link deviceId}).
   */
  @Input() bulkDeviceIds: string[] = [];
  /**
   * Current `downlinkQueue` value per device id (from the table subscription),
   * used in bulk mode to increment each device's queue correctly on Apply.
   */
  @Input() bulkDownlinkQueues: Record<string, number> = {};

  /** True when editing multiple devices at once. */
  get isBulk(): boolean {
    return this.bulkDeviceIds.length > 0;
  }

  /** Optional collapsible cards of SHARED_SCOPE JSON-object attributes. */
  @Input() objectCards: DeviceSettingObjectCard[] = [];
  /** Pre-fetched object-attribute values (raw JSON string or object), by attribute key. */
  @Input() objectValues: Record<string, unknown> = {};
  /** The single device's type — matched against object targets' `deviceTypes`. */
  @Input() deviceType = "";
  /** Bulk mode: device type per id, for per-device target routing on save. */
  @Input() bulkDeviceTypes: Record<string, string> = {};

  /** Emitted after a successful save (e.g. so the parent can refresh its table). */
  @Output() saved = new EventEmitter<void>();

  /** Read-only entity-group names. */
  groups: string[] = [];
  saving = false;

  // Stable, precomputed splits of `deviceSettings` (rebuilt only when the input
  // changes) — toggles render in a compact grid, everything else stacked. These
  // are fields (not getters) so the parent's 1s change-detection tick doesn't
  // recreate the child controls and make them flicker.
  toggleSettings: DeviceSettingControl[] = [];
  segmentedSettings: DeviceSettingControl[] = [];
  otherSettings: DeviceSettingControl[] = [];
  /** Snapshot of the form values at populate time, used to save only what changed. */
  private baseline: Record<string, unknown> = {};
  /** Per-object split into its gate field + remaining fields. Keyed by the
   *  object reference (not `key`) — one attribute key may span several cards. */
  private objectMeta = new Map<DeviceSettingObject, { gate: DeviceSettingControl | null; fields: DeviceSettingControl[] }>();

  readonly form: FormGroup;

  constructor(private fb: FormBuilder, private destroyRef: DestroyRef) {
    this.form = this.fb.group({ label: [""], description: [""] });
  }

  /** Whether the form has unsaved edits (drives the floating buttons). */
  get dirty(): boolean {
    return this.form.dirty;
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Ensure a control exists for each attribute select.
    if (changes["attributeSelects"]) {
      for (const sel of this.attributeSelects) {
        if (!this.form.contains(sel.key)) {
          this.form.addControl(sel.key, this.fb.control(""));
        }
      }
    }
    // Ensure a control exists for each device setting (toggles default to false),
    // and split them into the compact toggle grid vs the stacked rest.
    if (changes["deviceSettings"]) {
      for (const s of this.deviceSettings) {
        if (!this.form.contains(s.key)) {
          const initial = s.kind === "toggle" ? false : s.kind === "slider" ? s.min ?? 0 : "";
          this.form.addControl(s.key, this.fb.control(initial));
        }
      }
      this.toggleSettings = this.deviceSettings.filter((s) => s.kind === "toggle");
      this.segmentedSettings = this.deviceSettings.filter((s) => s.kind === "segmented");
      this.otherSettings = this.deviceSettings.filter((s) => s.kind !== "toggle" && s.kind !== "segmented");
    }
    // Ensure a control exists for every object sub-field (composite key), and
    // precompute each object's gate + remaining fields.
    if (changes["objectCards"]) {
      for (const obj of this.allObjects()) {
        for (const f of obj.fields) {
          const name = this.ctrlName(obj, f);
          if (!this.form.contains(name)) {
            const initial = f.kind === "toggle" ? false : f.kind === "slider" ? this.defaultNumeric(f) : "";
            this.form.addControl(name, this.fb.control(initial));
          }
        }
        const gate = obj.gateKey ? obj.fields.find((f) => f.key === obj.gateKey) ?? null : null;
        this.objectMeta.set(obj, { gate, fields: obj.fields.filter((f) => f !== gate) });
      }
    }
    // Repopulate from the pre-fetched inputs — but never clobber unsaved edits
    // (a live table refresh re-pushes these inputs while the user may be typing).
    if (
      !this.form.dirty &&
      (changes["label"] ||
        changes["description"] ||
        changes["attributeValues"] ||
        changes["attributeSelects"] ||
        changes["deviceSettings"] ||
        changes["deviceSettingsValues"] ||
        changes["objectCards"] ||
        changes["objectValues"])
    ) {
      this.populateForm();
    }
    if (changes["deviceId"]) {
      this.loadGroups(this.deviceId);
    }
  }

  private populateForm(): void {
    const values: Record<string, string | number | boolean | null> = {
      label: this.label ?? "",
      description: this.description ?? "",
    };
    for (const sel of this.attributeSelects) {
      values[sel.key] = this.attributeValues?.[sel.key] ?? "";
    }
    for (const s of this.deviceSettings) {
      // Bulk toggles start "unchanged" (null, tri-state) so an untouched toggle
      // isn't written; on/off must be set explicitly.
      values[s.key] =
        this.isBulk && s.kind === "toggle" ? null : this.coerceSettingValue(s, this.deviceSettingsValues?.[s.key]);
    }
    for (const obj of this.allObjects()) {
      const parsed = this.parseObject(this.objectValues?.[obj.key]);
      for (const f of obj.fields) {
        // Flat fields read their own top-level attribute, not the object.
        const raw = f.flatKey ? this.objectValues?.[f.flatKey] : parsed[f.key];
        values[this.ctrlName(obj, f)] = this.coerceSettingValue(f, raw);
      }
    }
    this.baseline = { ...values };
    // Drop any "Set Null" flags and re-enable gate switches they had locked.
    this.setNullKeys.clear();
    for (const obj of this.allObjects()) {
      const gate = this.gateOf(obj);
      if (gate) {
        this.form.get(this.objCtrl(obj.key, gate.key))?.enable({ emitEvent: false });
      }
    }
    this.form.reset(values);
    // Bodies that render already-open never fire a transition, so seed their
    // settled state here (otherwise their tooltips would stay clipped).
    this.settledObjects = new Set(this.allObjects().filter((o) => this.isObjGateOn(o)));
  }

  /** Composite form-control name for an object attribute's sub-field. */
  objCtrl(objKey: string, fieldKey: string): string {
    return `${objKey}::${fieldKey}`;
  }

  /** Form-control name for an object field — flat fields use their own key. */
  ctrlName(obj: DeviceSettingObject, f: DeviceSettingControl): string {
    return f.flatKey ?? this.objCtrl(obj.key, f.key);
  }

  /** An object's save targets: explicit `targets`, else key + mirrorKeys —
   *  plus an implicit flat target for every `flatKey` field. */
  private targetsOf(obj: DeviceSettingObject): DeviceSettingObjectTarget[] {
    const base: DeviceSettingObjectTarget[] =
      obj.targets ?? [{ key: obj.key }, ...(obj.mirrorKeys ?? []).map((key) => ({ key }))];
    const flats: DeviceSettingObjectTarget[] = obj.fields
      .filter((f) => f.flatKey)
      .map((f) => ({ key: f.flatKey!, flatField: f.key }));
    return [...base, ...flats];
  }

  /** All objects across all cards/groups (flattened). */
  private allObjects(): DeviceSettingObject[] {
    return this.objectCards.flatMap((c) => c.groups.flatMap((g) => g.objects));
  }

  /** The gate field of an object (or null when it has none). */
  gateOf(obj: DeviceSettingObject): DeviceSettingControl | null {
    return this.objectMeta.get(obj)?.gate ?? null;
  }

  /** The non-gate fields of an object. */
  fieldsOf(obj: DeviceSettingObject): DeviceSettingControl[] {
    return this.objectMeta.get(obj)?.fields ?? [];
  }

  /** Whether an object's gate is on (always true when it has no gate). */
  isObjGateOn(obj: DeviceSettingObject): boolean {
    const gate = this.gateOf(obj);
    return !gate || !!this.form.value[this.objCtrl(obj.key, gate.key)];
  }

  /** Objects whose reveal animation has finished (overflow released so field
   *  tooltips can escape the animated body — same idea as the collapsible
   *  card's `overflowVisible`). */
  private settledObjects = new Set<DeviceSettingObject>();

  /** Fully open: gate on AND the expand transition has finished. Collapsing
   *  drops this immediately (gate off), restoring the clip for the animation. */
  isObjSettled(obj: DeviceSettingObject): boolean {
    return this.isObjGateOn(obj) && this.settledObjects.has(obj);
  }

  onObjBodyTransitionEnd(obj: DeviceSettingObject, ev: TransitionEvent): void {
    if (ev.propertyName !== "grid-template-rows") {
      return;
    }
    if (this.isObjGateOn(obj)) {
      this.settledObjects.add(obj);
    } else {
      this.settledObjects.delete(obj);
    }
  }

  /** Object keys flagged "Set Null" (force the gate off across devices in bulk). */
  private setNullKeys = new Set<string>();

  /** Whether an object's "Set Null" is ticked. */
  isSetNull(obj: DeviceSettingObject): boolean {
    return this.setNullKeys.has(obj.key);
  }

  /**
   * Toggle "Set Null" for an object: when on, force its gate off (and mark it
   * dirty so the bulk save writes the disabled state). Turning it off reverts
   * that forced change so the object is no longer saved.
   */
  toggleSetNull(obj: DeviceSettingObject): void {
    const gate = this.gateOf(obj);
    const ctrl = gate ? this.form.get(this.objCtrl(obj.key, gate.key)) : null;
    if (this.setNullKeys.has(obj.key)) {
      this.setNullKeys.delete(obj.key);
      // Re-enable the switch and drop the forced change.
      ctrl?.enable();
      ctrl?.markAsPristine();
    } else {
      this.setNullKeys.add(obj.key);
      // Force off, mark dirty (so bulk saves it), then lock the switch.
      ctrl?.setValue(false);
      ctrl?.markAsDirty();
      ctrl?.disable();
    }
  }

  /** Displayed unit for a field — live-derived via `unitFrom`, else static `unit`. */
  unitFor(f: DeviceSettingControl): string {
    if (f.unitFrom) {
      return f.unitFrom.map[this.form.value[f.unitFrom.key] as string] ?? f.unit ?? "";
    }
    return f.unit ?? "";
  }

  /** Default numeric value for a slider field: 0 clamped into [min, max]. */
  private defaultNumeric(f: DeviceSettingControl): number {
    return Math.min(f.max ?? 100, Math.max(f.min ?? 0, 0));
  }

  /** Parse a raw attribute value (JSON string or object) into a plain object. */
  private parseObject(raw: unknown): Record<string, unknown> {
    if (raw == null || raw === "") {
      return {};
    }
    if (typeof raw === "object") {
      return raw as Record<string, unknown>;
    }
    try {
      return JSON.parse(String(raw)) ?? {};
    } catch {
      return {};
    }
  }

  /** Coerce a raw (string) attribute value to the form-control type for `s`. */
  private coerceSettingValue(s: DeviceSettingControl, raw: unknown): string | number | boolean {
    if (s.kind === "toggle") {
      return raw === true || raw === "true";
    }
    if (s.kind === "number" || s.kind === "slider") {
      const n = Number(raw);
      if (raw === "" || raw == null || !isFinite(n)) {
        return s.kind === "slider" ? this.defaultNumeric(s) : "";
      }
      return n;
    }
    return raw == null ? "" : String(raw);
  }

  /** The value to persist for setting `s` (typed: boolean / number / string). */
  private settingSaveValue(s: DeviceSettingControl, controlName: string = s.key): string | number | boolean {
    const v = this.form.value[controlName];
    if (s.kind === "toggle") {
      return !!v;
    }
    if (s.kind === "number" || s.kind === "slider") {
      const n = Number(v);
      return isFinite(n) ? n : s.kind === "slider" ? s.min ?? 0 : 0;
    }
    return v ?? "";
  }

  /**
   * Best-effort load of the device's entity groups (read-only; PE only). This is
   * the one settings field that can't ride the device query — group membership
   * comes from a separate API.
   */
  private loadGroups(deviceId: string | null): void {
    this.groups = [];
    if (!deviceId) {
      return;
    }
    let svc: any;
    try {
      svc = this.ctx.$injector.get(this.ctx.servicesMap.get("entityGroupService") as any);
    } catch {
      return;
    }
    if (!svc?.getEntityGroupsForEntity) {
      return;
    }
    svc
      .getEntityGroupsForEntity(EntityType.DEVICE, deviceId, { ignoreLoading: true, ignoreErrors: true })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (gs: any[]) => (this.groups = (gs ?? []).map((g) => g.name).filter((n: string) => n && n !== "All")),
        error: () => (this.groups = []),
      });
  }

  /**
   * Save only the fields that actually changed since the form was populated, so
   * editing one setting doesn't re-write (and re-downlink) every attribute. The
   * device is only fetched/saved when the label or description changed.
   */
  apply(): void {
    if (this.saving) {
      return;
    }
    const targetIds = this.isBulk ? this.bulkDeviceIds : this.deviceId ? [this.deviceId] : [];
    if (!targetIds.length) {
      return;
    }
    const cfg = { ignoreLoading: true, ignoreErrors: true };
    // In bulk mode there is no single baseline (the devices differ), so a field
    // counts as changed only when the user actually touched it (control dirty).
    const changed = (key: string): boolean =>
      this.isBulk ? !!this.form.get(key)?.dirty : this.form.value[key] !== this.baseline[key];

    // SERVER_SCOPE attribute-selects that changed.
    const serverAttrs = this.attributeSelects
      .filter((s) => changed(s.key))
      .map((s) => ({ key: s.key, value: this.form.value[s.key] }));

    // SHARED_SCOPE flat settings + JSON-object attributes that changed (an object
    // is re-saved whole when any of its sub-fields changed).
    const sharedAttrs: { key: string; value: unknown }[] = this.deviceSettings
      // `!= null` skips tri-state toggles left "unchanged" in bulk mode.
      .filter((s) => changed(s.key) && this.form.value[s.key] != null)
      .map((s) => ({ key: s.key, value: this.settingSaveValue(s) }));
    // Merge object fields by target attribute key, per device type: a key may
    // be split across several cards (each contributing some fields), an object
    // may mirror into extra keys, and a target may apply only to some hardware
    // versions (target.deviceTypes) with renamed properties (target.fieldMap)
    // or as a flat attribute (target.flatField). A JSON target is written whole
    // when any object contributing to it changed; flat targets are written when
    // their own field changed.
    const typeOfDevice = (id: string): string =>
      this.isBulk ? this.bulkDeviceTypes[id] ?? "" : this.deviceType || "";
    const objectAttrsByType = new Map<string, { key: string; value: unknown }[]>();
    for (const type of new Set(targetIds.map(typeOfDevice))) {
      const merged = new Map<string, Record<string, unknown>>();
      const changedKeys = new Set<string>();
      const flatAttrs: { key: string; value: unknown }[] = [];
      for (const obj of this.allObjects()) {
        const gate = this.gateOf(obj);
        const nullify = !!gate && this.setNullKeys.has(obj.key);
        const anyChanged = nullify || obj.fields.some((f) => changed(this.ctrlName(obj, f)));
        for (const target of this.targetsOf(obj)) {
          if (target.deviceTypes && !target.deviceTypes.includes(type)) {
            continue;
          }
          if (target.flatField) {
            const f = obj.fields.find((x) => x.key === target.flatField);
            if (f && changed(this.ctrlName(obj, f))) {
              flatAttrs.push({ key: target.key, value: this.settingSaveValue(f, this.ctrlName(obj, f)) });
            }
            continue;
          }
          const value = merged.get(target.key) ?? {};
          for (const f of obj.fields) {
            if (f.flatKey || target.omitFields?.includes(f.key)) {
              continue;
            }
            value[target.fieldMap?.[f.key] ?? f.key] = this.settingSaveValue(f, this.ctrlName(obj, f));
          }
          // "Set Null" forces the gate off regardless of the form state.
          if (nullify && gate) {
            value[target.fieldMap?.[gate.key] ?? gate.key] = false;
          }
          merged.set(target.key, value);
          if (anyChanged) {
            changedKeys.add(target.key);
          }
        }
      }
      objectAttrsByType.set(type, [
        ...[...changedKeys].map((key) => ({ key, value: merged.get(key)! })),
        ...flatAttrs,
      ]);
    }

    const labelChanged = !this.isBulk && (this.form.value.label ?? "") !== (this.baseline["label"] ?? "");
    const descChanged = !this.isBulk && (this.form.value.description ?? "") !== (this.baseline["description"] ?? "");

    // Save the changed attributes to every target device (one in single mode,
    // all checked devices in bulk). Each device gets the flat settings plus the
    // object attributes routed for its hardware version. A SHARED_SCOPE change
    // triggers a config downlink, so mark that device queued: bump its
    // downlinkQueue by 1 and set syncState = false. A rule chain decrements the
    // queue on each ChirpStack txack and sets syncState = true at 0. The current
    // per-device count comes from the table subscription — single: `downlinkQueue`;
    // bulk: `bulkDownlinkQueues[id]` — so the increment is correct for every device.
    const attrCalls: Observable<any>[] = [];
    for (const id of targetIds) {
      const entityId = { entityType: EntityType.DEVICE, id };
      const deviceSharedAttrs = [...sharedAttrs, ...(objectAttrsByType.get(typeOfDevice(id)) ?? [])];
      const deviceServerAttrs = [...serverAttrs];
      if (this.syncStateKey && deviceSharedAttrs.length) {
        if (this.downlinkQueueKey) {
          const current = this.isBulk ? this.bulkDownlinkQueues[id] ?? 0 : this.downlinkQueue || 0;
          deviceServerAttrs.push({ key: this.downlinkQueueKey, value: current + 1 });
        }
        deviceServerAttrs.push({ key: this.syncStateKey, value: false });
      }
      if (deviceServerAttrs.length) {
        attrCalls.push(
          this.ctx.attributeService.saveEntityAttributes(
            entityId,
            AttributeScope.SERVER_SCOPE,
            deviceServerAttrs,
            cfg,
          ) as Observable<any>,
        );
      }
      if (deviceSharedAttrs.length) {
        attrCalls.push(
          this.ctx.attributeService.saveEntityAttributes(
            entityId,
            AttributeScope.SHARED_SCOPE,
            deviceSharedAttrs,
            cfg,
          ) as Observable<any>,
        );
      }
    }

    // Nothing actually changed — just clear the dirty state and bail.
    if (!labelChanged && !descChanged && !attrCalls.length) {
      this.form.markAsPristine();
      return;
    }

    this.saving = true;
    const done = {
      next: () => {
        this.form.markAsPristine();
        this.saving = false;
        this.saved.emit();
      },
      error: () => (this.saving = false),
    };

    if (labelChanged || descChanged) {
      this.ctx.deviceService
        .getDevice(targetIds[0], cfg)
        .pipe(
          switchMap((device: any) => {
            const updated = {
              ...device,
              label: this.form.value.label ?? "",
              additionalInfo: { ...(device.additionalInfo ?? {}), description: this.form.value.description ?? "" },
            };
            return forkJoin([this.ctx.deviceService.saveDevice(updated) as Observable<any>, ...attrCalls]);
          }),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(done);
    } else {
      forkJoin(attrCalls).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(done);
    }
  }

  /** Discard edits and revert to the pre-fetched values. */
  cancel(): void {
    this.populateForm();
  }
}
