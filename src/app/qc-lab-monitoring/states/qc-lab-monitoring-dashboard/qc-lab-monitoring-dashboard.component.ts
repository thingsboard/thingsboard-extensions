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

import { AfterViewInit, ChangeDetectorRef, Component, DestroyRef, HostListener, Input, OnDestroy, OnInit, ViewChild } from "@angular/core";
import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { WidgetSubscriptionOptions } from "@core/public-api";
import { SharedModule } from "@shared/public-api";
import {
  AlarmSearchStatus,
  AliasFilterType,
  DataKeyType,
  Datasource,
  DatasourceType,
  Direction,
  EntityDataQuery,
  EntityFilter,
  EntityKeyType,
  RealtimeWindowType,
  TimewindowType,
  widgetType,
} from "@shared/public-api";
import type { AlarmService } from "@core/http/alarm.service";
import { DataTableAction, DataTableCellDirective, DataTableColumn, DataTableComponent } from "../../../components/shared/data-table/data-table.component";
import { ThemeToggleComponent } from "../../../components/shared/theme-toggle/theme-toggle.component";
import { TabBarComponent } from "../../../components/shared/tab-bar/tab-bar.component";
import { EntityDetailPanelComponent } from "../../../components/shared/entity-detail-panel/entity-detail-panel.component";
import { SegmentOption } from "../../../components/shared/segmented-control/segmented-control.component";
import { MetricChartCardComponent, MetricChartSection } from "../../../components/shared/metric-chart-card/metric-chart-card.component";
import { LineChartThreshold } from "../../../components/shared/line-chart/line-chart.component";
import { LorawanSignalCardComponent } from "../../../components/shared/lorawan-signal-card/lorawan-signal-card.component";
import { AttributeSelect, DeviceSettingControl, DeviceSettingObject, DeviceSettingObjectCard, DeviceSettingsCardComponent } from "../../../components/shared/device-settings-card/device-settings-card.component";
import { injectCss } from "../../../components/shared/cdn-loader";
import { WidgetContext } from "@home/models/widget-component.models";

/** A tab in the widget header. */
interface DashboardTab {
  id: string;
  label: string;
  icon: string;
}

/** One alarm row in the Alarms list. */
interface AlarmRow {
  id: string;
  createdTime: number;
  originatorName: string;
  /** Originator device id — used to tally active alarms per device. */
  originatorId: string;
  type: string;
  severity: string;
  acknowledged: boolean;
  cleared: boolean;
  /** Alarm `details.data` (shown after the date in the detail panel's Alarms tab). */
  detailsData: string;
  /** Precomputed visible text, used by the base table's search filter. */
  searchText: string;
}

/** One device row in the Devices list. */
interface DeviceRow {
  deviceId: string;
  name: string;
  label: string;
  /** Device profile / type — picks the hardware version's settings wiring. */
  type: string;
  alarmCount: number;
  /** Whether a "Channel N Threshold" alarm is active — colours that channel's value. */
  chn1Alarm: boolean;
  chn2Alarm: boolean;
  /** Latest channel temperatures, preformatted with the °C unit (or "—"). */
  tempChn1: string;
  tempChn2: string;
  /** Latest battery level (%), or null when unavailable. */
  battery: number | null;
  /** Timestamp (ms) of the latest battery reading, or null. */
  batteryTs: number | null;
  // Settings-tab data, pre-fetched here so the panel needs no per-click query.
  /** Raw device name (Hostname). */
  deviceName: string;
  /** Raw device label (Name/Alias). */
  deviceLabel: string;
  /** Device description (Note). */
  description: string;
  /** Sensor-channel server attributes. */
  sensorChannel1: string;
  sensorChannel2: string;
  /** Raw SHARED_SCOPE device-setting values, keyed by attribute key. */
  deviceSettings: Record<string, string>;
  /** Raw SHARED_SCOPE JSON-object attributes (calibration, alarms), by key. */
  objectValues: Record<string, unknown>;
  /** SERVER attr: true once all queued config downlinks have been acked. */
  syncState: boolean;
  /** SERVER attr: number of config downlinks queued but not yet acked. */
  downlinkQueue: number;
}

@Component({
  selector: "tb-qc-lab-monitoring-dashboard",
  templateUrl: "./qc-lab-monitoring-dashboard.component.html",
  styleUrls: ["./qc-lab-monitoring-dashboard.component.scss"],
  standalone: true,
  imports: [
    CommonModule,
    SharedModule,
    DataTableComponent,
    DataTableCellDirective,
    ThemeToggleComponent,
    TabBarComponent,
    EntityDetailPanelComponent,
    MetricChartCardComponent,
    LorawanSignalCardComponent,
    DeviceSettingsCardComponent,
  ],
})
export class QcLabMonitoringDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input() ctx: WidgetContext;

  /** Device types listed by this dashboard (== device profile names). */
  readonly deviceTypes = ["Milesight-TS302", "Milesight-TS302-V2"];

  readonly tabs: DashboardTab[] = [{ id: "overview", label: "Overview", icon: "dashboard" }];
  activeTab = "overview";

  /** Light/dark theme toggle (persisted per-user server-side, shared across dashboards). */
  darkMode = false;
  // attribute matches the value below).
  readonly siteFilter = "R20";

  // Devices table (devices of type Milesight-TS302 whose `site` client
  readonly devicesColumns: DataTableColumn[] = [
    { key: "name", header: "Device" },
    // Two channel temperatures rendered via a projected cell template.
    { key: "temperature", header: "Temperature", align: "right" },
  ];
  devicesRows: DeviceRow[] = [];
  devicesLoading = false;
  /** Currently selected device shown in the detail panel (null when closed). */
  selectedDevice: DeviceRow | null = null;
  /** Whether the right-side device detail panel is open. */
  detailOpen = false;
  // tb-metric-chart-card owning its own timeseries subscription/cache/spinner.
  metricsCharts: MetricChartSection[] = [
    {
      chartTitle: "Temperature",
      unit: "°C",
      // Baseline range; the axis grows past it when readings/thresholds fall outside.
      yMin: 18,
      yMax: 28,
      keys: [
        { name: "temperatureChn1", label: "Channel 1", color: "#1e5dff" },
        { name: "temperatureChn2", label: "Channel 2", color: "#a855f7" },
      ],
    },
  ];
  /** Stable map of the selected device's channel attributes for the settings card. */
  sensorChannelValues: Record<string, string> = {};
  // Settings tab: device settings mapped to SHARED_SCOPE attributes.
  readonly deviceSettingControls: DeviceSettingControl[] = [
    {
      kind: "segmented",
      key: "temperatureUnitDisplay",
      label: "Temperature unit",
      options: [
        { value: "celsius", label: "°C" },
        { value: "fahrenheit", label: "°F" },
      ],
    },
    {
      kind: "segmented",
      key: "timeDisplay",
      label: "Time format",
      options: [
        { value: "12_hour", label: "12H" },
        { value: "24_hour", label: "24H" },
      ],
    },
    {
      kind: "slider",
      key: "reportInterval",
      label: "Report interval",
      min: 1,
      max: 1440,
      step: 1,
      unit: "min",
      info: "Interval for transmitting data to the network server.",
    },
    {
      kind: "slider",
      key: "retransmitInterval",
      label: "Retransmission interval",
      min: 30,
      max: 1200,
      step: 10,
      unit: "s",
      info: "Interval between resent data packets.",
    },
    {
      kind: "buttons",
      key: "timeZone",
      label: "Time zone",
      options: [
        { value: "UTC-7", label: "UTC-7", tooltip: "Vancouver" },
        { value: "UTC-6", label: "UTC-6", tooltip: "Edmonton" },
      ],
    },
  ];
  /** Stable map of the selected device's SHARED_SCOPE settings for the settings card. */
  deviceSettingsValues: Record<string, string | number | boolean> = {};

  // Metric charts (Insights tab) — each card is a self-contained
  /** Stable map of the selected device's object-attribute values for the settings card. */
  objectValues: Record<string, unknown> = {};
  /** Whether the Devices table shows its multi-select checkbox column. */
  selectMode = false;
  /** Device IDs checked in the table's multi-select column. */
  selectedDeviceIds: string[] = [];
  /** Whether the bulk-settings panel (right sidebar) is open. */
  bulkEditOpen = false;
  /** The bulk panel reuses the entity detail panel with a single Settings tab. */
  readonly bulkTabs: SegmentOption[] = [{ id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" }];
  // Single rich-cell column rendered via a projected template (see HTML).
  readonly alarmColumns: DataTableColumn[] = [{ key: "alarm", header: "" }];

  // Settings tab: SHARED_SCOPE JSON-object attributes (Calibration + Alarms).
  alarmsRows: AlarmRow[] = [];
  alarmsLoading = false;
  /** Whether the alarms side panel is open. */
  alarmDialogOpen = false;
  /** Single-tab config for the alarms panel (the lone pill is hidden). */
  readonly alarmPanelTabs: SegmentOption[] = [
    { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms" },
  ];
  alarmSeverityFilter: string | null = null;
  /** Severity filter options (value matches the alarm severity, UPPER_CASE). */
  readonly alarmSeverities = [
    { value: "WARNING", label: "Warning" },
    { value: "MINOR", label: "Minor" },
    { value: "MAJOR", label: "Major" },
    { value: "CRITICAL", label: "Critical" },
  ];
  /** Alarm rows shown in the popup (after the severity filter). */
  displayedAlarms: AlarmRow[] = [];
  /** Severity filter for the detail panel's Alarms tab (independent of the popup). */
  detailAlarmSeverity: string | null = null;
  /** The selected device's alarms (after the Alarms-tab severity filter). */
  detailAlarms: AlarmRow[] = [];
  private readonly themeSettingKey = "darkMode";
  /** Colour of the temperature chart's alarm-threshold lines — the Major alarm
   *  severity orange (#f66716 light / #ff8a45 dark), resolved by the chart. */
  private readonly thresholdLineColor = "var(--c-bg-major-normal)";
  /** Active-alarm tally per device (resolved from the alarm subscription). */
  private deviceAlarmCount = new Map<string, number>();
  /** Per-device active "Channel N Threshold" alarm flags (colours the temp value). */
  private deviceChannelAlarms = new Map<string, { chn1: boolean; chn2: boolean }>();
  /** The device table, so its selection can be cleared when the panel closes. */
  @ViewChild("deviceTable") private deviceTable?: DataTableComponent;
  // Settings tab: sensor-channel dropdowns mapped to SERVER_SCOPE attributes.
  private readonly channelOptions = [
    { value: "temperatureProbe", label: "Temperature probe" },
    { value: "contactSwitch", label: "Contact switch" },
    { value: "none", label: "None" },
  ];
  readonly sensorChannelSelects: AttributeSelect[] = [
    { key: "sensorChannel1", label: "Channel 1", options: this.channelOptions },
    { key: "sensorChannel2", label: "Channel 2", options: this.channelOptions },
  ];
  // Temperature fields show °C/°F based on the Temperature unit button group.
  private readonly tempUnitFrom = { key: "temperatureUnitDisplay", map: { celsius: "°C", fahrenheit: "°F" } };
  // Calibration: temperatureChnNCalibrationSettings = {enable, calibrationValue}.
  private readonly calibrationFields: DeviceSettingControl[] = [
    { kind: "toggle", key: "enable", label: "Enable" },
    { kind: "slider", key: "calibrationValue", label: "Calibration value", min: -10, max: 10, step: 1, unitFrom: this.tempUnitFrom },
  ];
  // Mutation alarm: temperatureChnNMutationAlarmConfig = {enable, mutation}.
  private readonly mutationFields: DeviceSettingControl[] = [
    { kind: "toggle", key: "enable", label: "Enable" },
    { kind: "slider", key: "mutation", label: "Mutation value", min: 0, max: 20, step: 1, unitFrom: this.tempUnitFrom },
  ];
  // Threshold alarm: temperatureChnNAlarmConfig = {enable, alarmReleaseEnable,
  // condition, thresholdMin, thresholdMax, alarmReportingTimes, alarmReportingInterval}.
  // The per-channel card edits the threshold fields; the reporting fields live
  // in the shared "Alarm reporting" card below (written to both channels).
  private readonly thresholdFields: DeviceSettingControl[] = [
    { kind: "toggle", key: "enable", label: "Enable" },
    {
      kind: "buttons",
      key: "condition",
      label: "Condition",
      options: [
        { value: "below", label: "Below" },
        { value: "above", label: "Above" },
        { value: "between", label: "Between" },
        { value: "outside", label: "Outside" },
      ],
    },
    { kind: "slider", key: "thresholdMin", label: "Min threshold", min: -40, max: 80, step: 1, unitFrom: this.tempUnitFrom },
    { kind: "slider", key: "thresholdMax", label: "Max threshold", min: -40, max: 80, step: 1, unitFrom: this.tempUnitFrom },
  ];
  // Alarm reporting: the release/reporting sub-fields of temperatureChnNAlarmConfig,
  // edited once and applied to both channels' configs (values shown from channel 1).
  private readonly alarmReportingFields: DeviceSettingControl[] = [
    {
      kind: "toggle",
      key: "alarmReleaseEnable",
      label: "Alarm release",
      info: "Send a release message to clear the alarm when the reading returns within the thresholds.",
    },
    {
      kind: "slider",
      key: "alarmReportingTimes",
      label: "Reporting times",
      min: 1,
      max: 5,
      step: 1,
      info: "How many alarm packets are sent each time the alarm triggers.",
    },
    {
      kind: "slider",
      key: "alarmReportingInterval",
      label: "Reporting interval",
      min: 1,
      max: 10,
      step: 1,
      unit: "min",
      info: "Interval between alarm reports while the alarm condition persists.",
    },
  ];
  // Two hardware versions store the alarm-reporting settings differently:
  //  - Milesight-TS302 (V1): inside each channel's temperatureChnNAlarmConfig
  //    ({alarmReleaseEnable, alarmReportingTimes, alarmReportingInterval}).
  //  - Milesight-TS302-V2: globally, as a flat alarmReleaseEnable attribute
  //    plus alarmConfig = {alarmCounts, alarmInterval}.
  private readonly v2Type = "Milesight-TS302-V2";
  private readonly v1Type = "Milesight-TS302";
  /** V2 alarm reporting: same UI, bound to the global attributes natively. */
  private readonly alarmReportingFieldsV2: DeviceSettingControl[] = [
    { ...this.alarmReportingFields[0], flatKey: "alarmReleaseEnable" },
    { ...this.alarmReportingFields[1], key: "alarmCounts" },
    { ...this.alarmReportingFields[2], key: "alarmInterval" },
  ];
  /** Alarm reporting card per hardware version (single-device panel). */
  private reportingCard(version: "v1" | "v2"): DeviceSettingObjectCard {
    const object: DeviceSettingObject =
      version === "v2"
        ? { key: "alarmConfig", label: "", fields: this.alarmReportingFieldsV2 }
        : {
            key: "temperatureChn1AlarmConfig",
            label: "",
            mirrorKeys: ["temperatureChn2AlarmConfig"],
            fields: this.alarmReportingFields,
          };
    return { title: "Alarm reporting", flatFields: true, groups: [{ objects: [object] }] };
  }
  /**
   * Bulk alarm reporting: one set of controls, routed per hardware version on
   * save — V1 devices get the values inside both channel configs, V2 devices
   * get the global alarmConfig (renamed fields) + flat alarmReleaseEnable.
   */
  private readonly bulkReportingCard: DeviceSettingObjectCard = {
    title: "Alarm reporting",
    flatFields: true,
    groups: [
      {
        objects: [
          {
            key: "temperatureChn1AlarmConfig",
            label: "",
            fields: this.alarmReportingFields,
            targets: [
              { key: "temperatureChn1AlarmConfig", deviceTypes: [this.v1Type] },
              { key: "temperatureChn2AlarmConfig", deviceTypes: [this.v1Type] },
              {
                key: "alarmConfig",
                deviceTypes: [this.v2Type],
                fieldMap: { alarmReportingTimes: "alarmCounts", alarmReportingInterval: "alarmInterval" },
                omitFields: ["alarmReleaseEnable"],
              },
              { key: "alarmReleaseEnable", flatField: "alarmReleaseEnable", deviceTypes: [this.v2Type] },
            ],
          },
        ],
      },
    ],
  };
  private readonly calibrationCard: DeviceSettingObjectCard = {
    title: "Calibration",
    info: "Adds a fixed offset to each channel's temperature reading.",
    flatFields: true,
    groups: [
      {
        objects: [{ key: "temperatureChn1CalibrationSettings", label: "Channel 1", gateKey: "enable", fields: this.calibrationFields }],
      },
      {
        objects: [{ key: "temperatureChn2CalibrationSettings", label: "Channel 2", gateKey: "enable", fields: this.calibrationFields }],
      },
    ],
  };
  private readonly thresholdCard: DeviceSettingObjectCard = {
    title: "Threshold alarm",
    info: "Triggers an alarm when the reading crosses the configured min/max thresholds.",
    flatFields: true,
    groups: [
      {
        objects: [{ key: "temperatureChn1AlarmConfig", label: "Channel 1", gateKey: "enable", fields: this.thresholdFields }],
      },
      {
        objects: [{ key: "temperatureChn2AlarmConfig", label: "Channel 2", gateKey: "enable", fields: this.thresholdFields }],
      },
    ],
  };
  private readonly mutationCard: DeviceSettingObjectCard = {
    title: "Mutation alarm",
    info: "Triggers an alarm when the reading changes by more than the set amount between samples.",
    flatFields: true,
    groups: [
      {
        objects: [{ key: "temperatureChn1MutationAlarmConfig", label: "Channel 1", gateKey: "enable", fields: this.mutationFields }],
      },
      {
        objects: [{ key: "temperatureChn2MutationAlarmConfig", label: "Channel 2", gateKey: "enable", fields: this.mutationFields }],
      },
    ],
  };
  /** Cards for the single-device panel — reporting variant per selected device. */
  detailObjectCards: DeviceSettingObjectCard[] = this.cardsWithReporting(this.reportingCard("v1"));
  /** Cards for the bulk editor — reporting routed per device on save. */
  readonly bulkObjectCards: DeviceSettingObjectCard[] = this.cardsWithReporting(this.bulkReportingCard);

  private cardsWithReporting(reporting: DeviceSettingObjectCard): DeviceSettingObjectCard[] {
    return [this.calibrationCard, reporting, this.thresholdCard, this.mutationCard];
  }
  private alarmService: AlarmService;
  private alarmsSubscription: any;
  private devicesSubscription: any;
  // without re-querying on every individual message.
  private devicesRefreshTimer?: any;
  /** 1s ticker (runs only while the panel is open) so "Updated Xs ago" counts up. */
  private clockTimer?: any;

  constructor(private cd: ChangeDetectorRef, private destroyRef: DestroyRef) {}

  /** Whether the selected device has a pending (queued) settings downlink. */
  get settingsQueued(): boolean {
    return this.selectedDevice?.syncState === false;
  }

  /** Tabs for the single-device detail panel — the Alarms (bell) tab carries a
   *  live count badge of the selected device's active alarms. */
  get detailTabs(): SegmentOption[] {
    return [
      { id: "insights", label: "Insights", icon: "bar_chart", tooltip: "Insights" },
      { id: "alarms", label: "Alarms", icon: "notifications", tooltip: "Alarms", badge: this.selectedDevice?.alarmCount ?? 0 },
      { id: "settings", label: "Settings", icon: "settings", tooltip: "Settings" },
    ];
  }

  /** Header action(s) on the Devices table — a toggle for the select checkboxes. */
  get devicesActions(): DataTableAction[] {
    return [{ id: "select", icon: "checklist", tooltip: this.selectMode ? "Exit select" : "Select", active: this.selectMode }];
  }

  /** Whether every device is selected (drives the bulk bar's "Select all" box). */
  get allDevicesSelected(): boolean {
    return this.devicesRows.length > 0 && this.selectedDeviceIds.length === this.devicesRows.length;
  }

  /** Current downlinkQueue per device id (from the live table subscription), so the
   *  bulk form can increment each device's queue accurately. */
  get deviceQueues(): Record<string, number> {
    return this.devicesRows.reduce((acc, r) => {
      acc[r.deviceId] = r.downlinkQueue;
      return acc;
    }, {} as Record<string, number>);
  }

  /** Device type per id — the bulk editor routes alarm-reporting saves by it. */
  get deviceTypesById(): Record<string, string> {
    return this.devicesRows.reduce((acc, r) => {
      acc[r.deviceId] = r.type;
      return acc;
    }, {} as Record<string, string>);
  }

  /** Number of active alarms (drives the header badge) — always the unfiltered total. */
  get activeAlarmCount(): number {
    return this.alarmsRows.length;
  }

  /** All SHARED_SCOPE object/flat attribute keys the settings cards can read
   *  (for prefetch), across both hardware versions — deduped. */
  private get objectAttributeKeys(): string[] {
    const cards = [...this.cardsWithReporting(this.reportingCard("v1")), this.reportingCard("v2")];
    const keys = cards.flatMap((c) =>
      c.groups.flatMap((g) => g.objects.flatMap((o) => [o.key, ...o.fields.map((f) => f.flatKey).filter(Boolean) as string[]])),
    );
    return [...new Set(keys)];
  }

  /** Entity filter selecting the configured device type(s). */
  private get deviceFilter(): EntityFilter {
    return {
      type: AliasFilterType.deviceType,
      deviceTypes: this.deviceTypes,
      deviceNameFilter: "",
    };
  }

  /** Open the detail panel for a clicked device row. */
  onDeviceRowClick(row: Record<string, any>): void {
    this.selectedDevice = row as DeviceRow;
    this.detailOpen = true;
    this.syncSettingsInputs();
    this.applyDetailAlarms();
    this.startClock();
  }

  /** Toggle the checkbox column from the Devices table header action. */
  onDeviceAction(id: string): void {
    if (id === "select") {
      this.selectMode = !this.selectMode;
      if (!this.selectMode) {
        // Leaving select mode: drop the selection and close the bulk panel.
        this.clearDeviceSelection();
        this.bulkEditOpen = false;
      }
    }
  }

  /** Track the checked device rows for bulk editing. */
  onDeviceSelectionChange(rows: Record<string, any>[]): void {
    this.selectedDeviceIds = rows.map((r) => r["deviceId"] as string);
  }

  /** Bulk bar "Select all": check all devices, or clear when already all checked. */
  toggleSelectAll(): void {
    this.deviceTable?.checkAll(!this.allDevicesSelected);
  }

  /** Open the bulk-settings panel for the checked devices. */
  openBulkEdit(): void {
    if (this.selectedDeviceIds.length) {
      this.bulkEditOpen = true;
    }
  }

  /** Close the bulk-settings panel without clearing the selection. */
  closeBulkEdit(): void {
    this.bulkEditOpen = false;
  }

  /** After a bulk save: close the panel, clear the checkboxes, refresh. */
  onBulkSaved(): void {
    this.bulkEditOpen = false;
    this.clearDeviceSelection();
    this.loadDevices();
  }

  /** Clear the multi-select checkboxes (and the tracked ids). */
  clearDeviceSelection(): void {
    this.deviceTable?.clearChecked();
    this.selectedDeviceIds = [];
  }

  /** Close the detail panel and clear the row highlight (the chart cards tear
   *  down their own subscriptions when removed from the DOM). */
  closeDetail(): void {
    this.detailOpen = false;
    this.selectedDevice = null;
    this.detailAlarms = [];
    this.sensorChannelValues = {};
    this.deviceSettingsValues = {};
    this.objectValues = {};
    this.stopClock();
    this.deviceTable?.clearSelection();
  }

  /**
   * Close the detail panel when clicking outside it. Clicks on a table are
   * ignored so selecting another device switches the panel rather than closing
   * it; clicks inside the panel are ignored too.
   */
  @HostListener("document:pointerdown", ["$event"])
  onDocumentPointerDown(event: Event): void {
    if (!this.detailOpen) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest("tb-entity-detail-panel") || target?.closest("tb-data-table")) {
      return;
    }
    this.closeDetail();
    this.cd.detectChanges();
  }

  /** Toggle the detail-panel Alarms-tab severity filter (click active = clear). */
  toggleDetailAlarmSeverity(value: string): void {
    this.detailAlarmSeverity = this.detailAlarmSeverity === value ? null : value;
    this.applyDetailAlarms();
  }
  // Debounce the table refresh: coalesce a burst of telemetry into a single
  // re-query shortly after the last change, so values update near-instantly

  ngOnInit(): void {
    this.ctx.$scope.qcLabMonitoringDashboardComponent = this;
    // Load the Material Symbols Rounded variable font so all dashboard icons use
    // the rounded variant.
    injectCss("tb-ext-material-symbols-rounded", "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200");
    this.alarmService = this.ctx.$injector.get(this.ctx.servicesMap.get("alarmService")) as AlarmService;
    this.loadUserPreferences();

    this.subscribeAlarms();
    this.loadDevices(); // initial render
    this.subscribeDevices(); // live updates when temperatures / attributes change
  }

  ngOnDestroy(): void {
    if (this.alarmsSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.alarmsSubscription.id);
    }
    if (this.devicesSubscription) {
      this.ctx.subscriptionApi.removeSubscription(this.devicesSubscription.id);
    }
    clearTimeout(this.devicesRefreshTimer);
    this.stopClock();
  }

  ngAfterViewInit(): void {
    this.cd.detectChanges();
  }

  /**
   * Called by ThingsBoard whenever subscription data changes. This dashboard
   * sources its own data via custom subscriptions (devices + alarms), so there
   * is no widget datasource to react to — just keep the view in sync.
   */
  onDataUpdated(): void {
    this.ctx.detectChanges();
  }

  /** Called by ThingsBoard when the widget is resized. Nothing to re-measure here. */
  onResize(): void {
    this.cd.detectChanges();
  }

  selectTab(tabId: string): void {
    this.activeTab = tabId;
  }

  toggleTheme(): void {
    this.darkMode = !this.darkMode;
    this.cd.detectChanges();
    // Persist to the logged-in user's settings (merged server-side).
    this.ctx.userSettingsService
      .putUserSettings({ [this.themeSettingKey]: this.darkMode } as any)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe();
  }

  /** Toggle the severity filter (clicking the active one clears it). */
  toggleAlarmSeverity(value: string): void {
    this.alarmSeverityFilter = this.alarmSeverityFilter === value ? null : value;
    this.applyAlarmFilter();
  }

  ackAlarm(alarm: AlarmRow): void {
    if (alarm.acknowledged) {
      return;
    }
    alarm.acknowledged = true;
    this.alarmService
      .ackAlarm(alarm.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => (alarm.acknowledged = false) });
  }

  // -- alarm popup ------------------------------------------------------------

  clearAlarm(alarm: AlarmRow): void {
    if (alarm.cleared) {
      return;
    }
    alarm.cleared = true;
    this.alarmService
      .clearAlarm(alarm.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => (alarm.cleared = false) });
  }

  /** Load every device of type Milesight-TS302 into the Devices table. */
  /** Reload the Devices table (also called after a device's settings are saved). */
  loadDevices(): void {
    this.devicesLoading = true;
    const deviceQuery: EntityDataQuery = {
      entityFilter: this.deviceFilter,
      pageLink: {
        pageSize: 1024,
        page: 0,
        sortOrder: { key: { type: EntityKeyType.ENTITY_FIELD, key: "name" }, direction: Direction.ASC },
      },
      entityFields: [
        { type: EntityKeyType.ENTITY_FIELD, key: "name" },
        { type: EntityKeyType.ENTITY_FIELD, key: "label" },
        // Device type/profile — picks the hardware version's settings wiring.
        { type: EntityKeyType.ENTITY_FIELD, key: "type" },
        // additionalInfo (JSON) carries the device description (Settings → Note).
        { type: EntityKeyType.ENTITY_FIELD, key: "additionalInfo" },
      ],
      latestValues: [
        // `site` client attribute — used to keep only the devices for this site.
        { type: EntityKeyType.CLIENT_ATTRIBUTE, key: "site" },
        // Latest channel temperatures shown in the table.
        { type: EntityKeyType.TIME_SERIES, key: "temperatureChn1" },
        { type: EntityKeyType.TIME_SERIES, key: "temperatureChn2" },
        // Latest battery level shown in the detail panel.
        { type: EntityKeyType.TIME_SERIES, key: "battery" },
        // Settings → Sensor channels (server attributes), pre-fetched here.
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "sensorChannel1" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "sensorChannel2" },
        // Settings sync state (server attr derived by the calculated field).
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "syncState" },
        { type: EntityKeyType.SERVER_ATTRIBUTE, key: "downlinkQueue" },
        // Settings → Device settings + object attributes (shared), pre-fetched here.
        ...this.deviceSettingControls.map((c) => ({ type: EntityKeyType.SHARED_ATTRIBUTE, key: c.key })),
        ...this.objectAttributeKeys.map((key) => ({ type: EntityKeyType.SHARED_ATTRIBUTE, key })),
      ],
    };

    const cfg = { ignoreLoading: true, ignoreErrors: true };
    this.ctx.entityService
      .findEntityDataByQuery(deviceQuery, cfg)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (devicesPage) => {
          this.devicesRows = devicesPage.data
            // Keep only devices whose `site` client attribute matches.
            .filter((d) => (d.latest?.[EntityKeyType.CLIENT_ATTRIBUTE]?.["site"]?.value ?? "") === this.siteFilter)
            .map((d) => {
              const fields = d.latest?.[EntityKeyType.ENTITY_FIELD] ?? {};
              const ts = d.latest?.[EntityKeyType.TIME_SERIES] ?? {};
              const attrs = d.latest?.[EntityKeyType.SERVER_ATTRIBUTE] ?? {};
              const shared = d.latest?.[EntityKeyType.SHARED_ATTRIBUTE] ?? {};
              const deviceId = d.entityId.id;
              const name = fields["name"]?.value ?? "";
              const label = fields["label"]?.value ?? "";
              const batt = ts["battery"];
              return {
                deviceId,
                name: label || name || "Unknown device",
                label: name,
                type: fields["type"]?.value ?? "",
                alarmCount: this.deviceAlarmCount.get(deviceId) ?? 0,
                chn1Alarm: this.deviceChannelAlarms.get(deviceId)?.chn1 ?? false,
                chn2Alarm: this.deviceChannelAlarms.get(deviceId)?.chn2 ?? false,
                tempChn1: this.formatTemp(ts["temperatureChn1"]?.value),
                tempChn2: this.formatTemp(ts["temperatureChn2"]?.value),
                battery: this.parseBattery(batt?.value),
                batteryTs: batt?.ts ?? null,
                deviceName: name,
                deviceLabel: label,
                description: this.parseDescription(fields["additionalInfo"]?.value),
                sensorChannel1: attrs["sensorChannel1"]?.value ?? "none",
                sensorChannel2: attrs["sensorChannel2"]?.value ?? "none",
                // Absent syncState = nothing ever queued -> treat as synced (true).
                // Value arrives stringified ("false"/"true"); only "false" = queued.
                syncState: String(attrs["syncState"]?.value ?? "true") !== "false",
                downlinkQueue: Number(attrs["downlinkQueue"]?.value ?? 0),
                deviceSettings: this.deviceSettingControls.reduce((acc, c) => {
                  acc[c.key] = shared[c.key]?.value ?? "";
                  return acc;
                }, {} as Record<string, string>),
                objectValues: this.objectAttributeKeys.reduce((acc, key) => {
                  acc[key] = shared[key]?.value ?? null;
                  return acc;
                }, {} as Record<string, unknown>),
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name));
          this.devicesLoading = false;
          this.refreshSelectedDevice();
          this.cd.detectChanges();
        },
        error: () => {
          this.devicesLoading = false;
          this.cd.detectChanges();
        },
      });
  }

  /** Live "x ago" string for a past timestamp (ms): seconds → minutes → hours →
   *  days. Re-evaluated every second by the panel clock while open. */
  relativeTime(ts: number | null): string {
    if (!ts) {
      return "—";
    }
    // Clamp to 0 — device clocks can run slightly ahead (or, with unsynced RTCs,
    // well ahead) of the browser, which would otherwise read as a negative age.
    const secs = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (secs === 0) {
      return "just now";
    }
    if (secs < 60) {
      return `${secs}s ago`;
    }
    const mins = Math.floor(secs / 60);
    if (mins < 60) {
      return `${mins}m ago`;
    }
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      return `${hours}h ago`;
    }
    return `${Math.floor(hours / 24)}d ago`;
  }

  severityLabel(severity: string): string {
    if (!severity) {
      return "";
    }
    return severity.charAt(0) + severity.slice(1).toLowerCase();
  }

  severityClass(severity: string): string {
    return (severity || "").toLowerCase();
  }

  /** Number of filled segments (1–4) for the severity bar. */
  severityRank(severity: string): number {
    switch ((severity || "").toUpperCase()) {
      case "CRITICAL":
        return 4;
      case "MAJOR":
        return 3;
      case "MINOR":
        return 2;
      default:
        return 1; // WARNING / INDETERMINATE
    }
  }

  // -- data -------------------------------------------------------------------

  /** Keep the settings card's attribute-values maps in sync with the selection. */
  private syncSettingsInputs(): void {
    const d = this.selectedDevice;
    this.sensorChannelValues = d ? { sensorChannel1: d.sensorChannel1, sensorChannel2: d.sensorChannel2 } : {};
    this.deviceSettingsValues = d ? { ...d.deviceSettings } : {};
    this.objectValues = d ? { ...d.objectValues } : {};
    // Swap the Alarm reporting card to match the selected device's hardware
    // version (only rebuild on an actual change, to avoid form re-populates).
    const version = d?.type === this.v2Type ? "v2" : "v1";
    const wanted = this.cardsWithReporting(this.reportingCard(version));
    if (this.detailObjectCards[1]?.groups[0]?.objects[0]?.key !== wanted[1].groups[0].objects[0].key) {
      this.detailObjectCards = wanted;
    }
    this.syncChartThresholds();
  }

  /**
   * Redraw the temperature chart's threshold lines from the selected device's
   * "Threshold alarm" configs. Only rebuilds the section when the lines actually
   * change, so live attribute updates don't force a chart re-render.
   */
  private syncChartThresholds(): void {
    const thresholds = this.buildTempThresholds();
    const section = this.metricsCharts[0];
    if (JSON.stringify(section.thresholds ?? []) === JSON.stringify(thresholds)) {
      return;
    }
    this.metricsCharts = [{ ...section, thresholds }, ...this.metricsCharts.slice(1)];
  }

  /**
   * Threshold lines for the temperature chart: min/max from each enabled
   * `temperatureChnNAlarmConfig`, filtered by its condition (below → min only,
   * above → max only) and deduped so identical channel thresholds draw once.
   * Each line is captioned with its own value in the device's display unit.
   */
  private buildTempThresholds(): LineChartThreshold[] {
    const out: LineChartThreshold[] = [];
    const seen = new Set<number>();
    const unit = this.tempUnit();
    for (const key of ["temperatureChn1AlarmConfig", "temperatureChn2AlarmConfig"]) {
      // Object attributes arrive stringified — parse before reading fields, and
      // treat the stringified "true" as enabled (same coercion as the settings card).
      const cfg = this.parseObjectAttribute(this.objectValues[key]);
      if (cfg["enable"] !== true && cfg["enable"] !== "true") {
        continue;
      }
      const condition = String(cfg["condition"] ?? "").toLowerCase();
      const values: unknown[] = [];
      if (condition !== "above") {
        values.push(cfg["thresholdMin"]);
      }
      if (condition !== "below") {
        values.push(cfg["thresholdMax"]);
      }
      for (const raw of values) {
        const n = Number(raw);
        if (raw == null || raw === "" || !isFinite(n) || seen.has(n)) {
          continue;
        }
        seen.add(n);
        out.push({ value: n, color: this.thresholdLineColor, label: unit ? `${n} ${unit}` : `${n}` });
      }
    }
    return out;
  }

  /** Display unit (°C/°F) from the selected device's `temperatureUnitDisplay`. */
  private tempUnit(): string {
    const raw = String(this.deviceSettingsValues[this.tempUnitFrom.key] ?? "").toLowerCase();
    return (this.tempUnitFrom.map as Record<string, string>)[raw] ?? "";
  }

  /** An object attribute's value as an object (it arrives JSON-stringified). */
  private parseObjectAttribute(raw: unknown): Record<string, any> {
    if (raw == null || raw === "") {
      return {};
    }
    if (typeof raw === "object") {
      return raw as Record<string, any>;
    }
    try {
      return JSON.parse(String(raw)) ?? {};
    } catch {
      return {};
    }
  }

  /** Tick once a second so the "Updated Xs ago" label counts up live. */
  private startClock(): void {
    if (this.clockTimer) {
      return;
    }
    this.clockTimer = setInterval(() => this.cd.detectChanges(), 1000);
  }

  private stopClock(): void {
    clearInterval(this.clockTimer);
    this.clockTimer = undefined;
  }

  /** Rebuild the Alarms-tab list: the selected device's alarms, severity-filtered. */
  private applyDetailAlarms(): void {
    const id = this.selectedDevice?.deviceId;
    if (!id) {
      this.detailAlarms = [];
      return;
    }
    const sev = this.detailAlarmSeverity;
    this.detailAlarms = this.alarmsRows.filter((a) => a.originatorId === id && (!sev || (a.severity || "").toUpperCase() === sev));
  }

  private loadUserPreferences(): void {
    this.ctx.userSettingsService
      .loadUserSettings()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((settings: any) => {
        this.darkMode = !!settings?.[this.themeSettingKey];
        this.cd.detectChanges();
      });
  }

  private applyAlarmFilter(): void {
    const f = this.alarmSeverityFilter;
    this.displayedAlarms = f ? this.alarmsRows.filter((r) => (r.severity || "").toUpperCase() === f) : this.alarmsRows;
  }

  /**
   * Live "latest" subscription over the device set's channel temperatures and
   * `site` attribute. Whenever a value changes, reload the table so it always
   * reflects the latest values without a page refresh. The initial emission is
   * skipped — the explicit loadDevices() in ngOnInit covers the first render.
   */
  private subscribeDevices(): void {
    const datasources: Datasource[] = [
      {
        type: DatasourceType.entity,
        name: "devices",
        entityFilter: this.deviceFilter,
        dataKeys: [
          { name: "temperatureChn1", label: "temperatureChn1", type: DataKeyType.timeseries, settings: {} },
          { name: "temperatureChn2", label: "temperatureChn2", type: DataKeyType.timeseries, settings: {} },
          { name: "battery", label: "battery", type: DataKeyType.timeseries, settings: {} },
          { name: "site", label: "site", type: DataKeyType.attribute, settings: {} },
          { name: "sensorChannel1", label: "sensorChannel1", type: DataKeyType.attribute, settings: {} },
          { name: "sensorChannel2", label: "sensorChannel2", type: DataKeyType.attribute, settings: {} },
          { name: "syncState", label: "syncState", type: DataKeyType.attribute, settings: {} },
          { name: "downlinkQueue", label: "downlinkQueue", type: DataKeyType.attribute, settings: {} },
          // SHARED_SCOPE device settings + object attributes — refresh on change.
          ...[...this.deviceSettingControls.map((c) => c.key), ...this.objectAttributeKeys].map((key) => ({
            name: key,
            label: key,
            type: DataKeyType.attribute,
            settings: {},
          })),
        ],
      },
    ];

    let firstEmission = true;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.latest,
      datasources,
      callbacks: {
        onDataUpdated: () => {
          if (firstEmission) {
            firstEmission = false;
            return;
          }
          // Debounce: reload shortly after the last change so a burst of telemetry
          // coalesces into one re-query, but values still update near-instantly.
          clearTimeout(this.devicesRefreshTimer);
          this.devicesRefreshTimer = setTimeout(() => this.loadDevices(), 300);
        },
      },
    };

    this.ctx.subscriptionApi
      .createSubscription(options, true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => {
        this.devicesSubscription = subscription;
      });
  }

  /**
   * Live alarm subscription over the device set. Alarm subscriptions do not
   * auto-start, so subscribeForAlarms() must be called explicitly.
   */
  private subscribeAlarms(): void {
    this.alarmsLoading = true;
    const alarmSource: Datasource = {
      type: DatasourceType.entity,
      name: "alarms",
      entityFilter: this.deviceFilter,
      dataKeys: [
        { name: "createdTime", label: "createdTime", type: DataKeyType.alarm, settings: {} },
        { name: "type", label: "type", type: DataKeyType.alarm, settings: {} },
        { name: "severity", label: "severity", type: DataKeyType.alarm, settings: {} },
      ],
    };

    // A REALTIME timewindow (not history) so the alarm subscription streams live
    // updates — new alarms appear and cleared/acked ones drop out without a manual
    // refresh. The wide window still surfaces alarms of any age for these devices.
    const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
    const options: WidgetSubscriptionOptions = {
      type: widgetType.alarm,
      alarmSource,
      useDashboardTimewindow: false,
      timeWindowConfig: {
        selectedTab: TimewindowType.REALTIME,
        realtime: { realtimeType: RealtimeWindowType.LAST_INTERVAL, timewindowMs: tenYearsMs },
      },
      callbacks: {
        onDataUpdated: (subscription) => this.onAlarmsSubscriptionUpdated(subscription),
      },
    };

    this.ctx.subscriptionApi
      .createSubscription(options, false)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((subscription) => {
        this.alarmsSubscription = subscription;
        subscription.subscribeForAlarms(
          {
            pageSize: 1024,
            page: 0,
            sortOrder: { key: { type: EntityKeyType.ALARM_FIELD, key: "createdTime" }, direction: Direction.DESC },
            searchPropagatedAlarms: true,
            typeList: [],
            statusList: [AlarmSearchStatus.ACTIVE], // active (uncleared) alarms only
            severityList: [],
          },
          null
        );
      });
  }

  private onAlarmsSubscriptionUpdated(subscription: any): void {
    const alarms = subscription?.alarms?.data ?? [];
    this.alarmsRows = alarms.map((a: any) => {
      const originatorName = a.originatorDisplayName || a.originatorLabel || a.originatorName || "";
      const rawData = a.details?.data;
      const detailsData = rawData == null ? "" : typeof rawData === "object" ? JSON.stringify(rawData) : String(rawData);
      return {
        id: a.id?.id ?? a.id,
        createdTime: a.createdTime,
        originatorName,
        originatorId: a.originator?.id ?? a.originatorId ?? "",
        type: a.type,
        severity: a.severity,
        acknowledged: !!(a.acknowledged ?? a.ackTs > 0),
        cleared: !!(a.cleared ?? a.clearTs > 0),
        detailsData,
        searchText: `${originatorName} ${a.type} ${this.severityLabel(a.severity)} ${new Date(a.createdTime).toLocaleString()}`,
      };
    });
    this.alarmsLoading = false;
    this.applyAlarmCounts(); // refresh the per-device active-alarm tallies
    this.applyAlarmFilter(); // refresh the popup's (optionally severity-filtered) list
    this.applyDetailAlarms(); // refresh the detail panel's Alarms-tab list
    this.cd.detectChanges();
  }

  /** Recompute the active-alarm count per device and inject it into the device rows. */
  private applyAlarmCounts(): void {
    const counts = new Map<string, number>();
    const chan = new Map<string, { chn1: boolean; chn2: boolean }>();
    for (const a of this.alarmsRows) {
      if (!a.originatorId) {
        continue;
      }
      counts.set(a.originatorId, (counts.get(a.originatorId) ?? 0) + 1);
      // "Channel 1/2 Threshold[ Alarm]" → flag that channel for this device.
      if (a.type.includes("Threshold")) {
        const flags = chan.get(a.originatorId) ?? { chn1: false, chn2: false };
        if (a.type.includes("Channel 1")) {
          flags.chn1 = true;
        }
        if (a.type.includes("Channel 2")) {
          flags.chn2 = true;
        }
        chan.set(a.originatorId, flags);
      }
    }
    this.deviceAlarmCount = counts;
    this.deviceChannelAlarms = chan;
    this.devicesRows = this.devicesRows.map((r) => ({
      ...r,
      alarmCount: counts.get(r.deviceId) ?? 0,
      chn1Alarm: chan.get(r.deviceId)?.chn1 ?? false,
      chn2Alarm: chan.get(r.deviceId)?.chn2 ?? false,
    }));
    this.refreshSelectedDevice();
  }

  /** Re-point the detail panel at the refreshed row object so it shows live values. */
  private refreshSelectedDevice(): void {
    if (this.selectedDevice) {
      const updated = this.devicesRows.find((r) => r.deviceId === this.selectedDevice!.deviceId);
      if (updated) {
        this.selectedDevice = updated;
        this.syncSettingsInputs();
      }
    }
  }

  // -- severity helpers (shared with the alarm cell template) -----------------

  /** Format a raw temperature value to one decimal with the °C unit; "—" when not numeric. */
  private formatTemp(raw: any): string {
    if (raw === "" || raw == null) {
      return "—";
    }
    const n = Number(raw);
    return isFinite(n) ? `${n.toFixed(1)} °C` : "—";
  }

  /** Extract the description from the device's additionalInfo (JSON string). */
  private parseDescription(raw: any): string {
    if (!raw) {
      return "";
    }
    try {
      return JSON.parse(raw)?.description ?? "";
    } catch {
      return "";
    }
  }

  /** Parse a raw battery value to a rounded percentage (0–100), or null. */
  private parseBattery(raw: any): number | null {
    if (raw === "" || raw == null) {
      return null;
    }
    const n = Number(raw);
    if (!isFinite(n)) {
      return null;
    }
    return Math.max(0, Math.min(100, Math.round(n)));
  }
}
