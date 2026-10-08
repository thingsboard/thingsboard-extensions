import { ChangeDetectorRef, Component, Injector, Input, OnChanges, SimpleChanges, ViewChild } from '@angular/core';
import { ExecutionPathRef, FilterState, TraceDetail, TraceSettings } from './rule-engine-monitoring.models';
import { RuleEngineMonitoringWidgetService } from './rule-engine-monitoring.service';
import { TracesComponent } from './traces.component';
import { TimeRangeChange } from './time-range-selector.component';

type TracingView = 'paths' | 'traces';

const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'tb-rem-tracing',
  templateUrl: './tracing.component.html',
  styleUrls: ['./tracing.component.scss'],
  standalone: false,
})
export class TracingComponent implements OnChanges {

  @Input() filterState: FilterState | null = null;
  @Input() injector: Injector | null = null;

  // ── Local time ranges. Execution Paths and Traces each own an INDEPENDENT range, so switching tabs never
  //    overwrites the other's selection; only a drill-down (onViewTraces) seeds the Traces range from Paths.
  //    Execution Paths uses day granularity (buckets are day-aligned); Traces uses full time granularity.
  //    Dimension filters (queues/chains/nodes/services) are still inherited from the global filterState. ──
  pathsRangePreset = '24h';
  pathsRangeCustomStart = '';
  pathsRangeCustomEnd = '';
  private pathsRangeStartTs = 0;
  private pathsRangeEndTs = 0;

  tracesRangePreset = '24h';
  tracesRangeCustomStart = '';
  tracesRangeCustomEnd = '';
  private tracesRangeStartTs = 0;
  private tracesRangeEndTs = 0;

  // filterState handed to each sibling view: the global dimension filters with that view's own time range applied.
  pathsFilterState: FilterState | null = null;
  tracesFilterState: FilterState | null = null;

  // kept mounted (hidden) so its filters/selection survive navigation; reloaded when the Traces tab opens
  @ViewChild(TracesComponent) tracesComp?: TracesComponent;

  // sibling view selection + drill-down state
  activeView: TracingView = 'paths';
  pathFilter: ExecutionPathRef | null = null;

  // shared Trace Details overlay (open over whichever sibling view is active)
  detailTrace: TraceDetail | null = null;
  detailLoading = false;

  // ── Trace settings (shared header status + drawer) ──
  settings: TraceSettings | null = null;
  draft: TraceSettings | null = null;
  settingsOpen = false;
  settingsSaving = false;
  sampleUnit: 'seconds' | 'minutes' = 'minutes';

  private service: RuleEngineMonitoringWidgetService | null = null;

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['injector'] && this.injector && !this.service) {
      this.service = new RuleEngineMonitoringWidgetService(this.injector);
      this.loadSettings();
    }
    // Rebuild the sibling-view filter state whenever the global filters change, keeping our own time range.
    if (changes['filterState']) {
      if (!this.pathsRangeEndTs) {
        const endTs = Date.now();
        this.pathsRangeEndTs = endTs;
        this.pathsRangeStartTs = endTs - DAY_MS;   // default: Last 24h
      }
      if (!this.tracesRangeEndTs) {
        const endTs = Date.now();
        this.tracesRangeEndTs = endTs;
        this.tracesRangeStartTs = endTs - DAY_MS;  // default: Last 24h
      }
      this.applyPathsRange();
      this.applyTracesRange();
    }
  }

  // ── Local time range (shared by Execution Paths + Traces) ───────────────────

  /** Picker change from the Execution Paths toolbar; updates only the Paths range. */
  onPathsRangeChange(e: TimeRangeChange): void {
    this.pathsRangePreset = e.preset;
    this.pathsRangeCustomStart = e.customStart;
    this.pathsRangeCustomEnd = e.customEnd;
    this.pathsRangeStartTs = e.startTs;
    this.pathsRangeEndTs = e.endTs;
    this.applyPathsRange();
  }

  /** Picker change from the Traces toolbar; updates only the Traces range. */
  onTracesRangeChange(e: TimeRangeChange): void {
    this.tracesRangePreset = e.preset;
    this.tracesRangeCustomStart = e.customStart;
    this.tracesRangeCustomEnd = e.customEnd;
    this.tracesRangeStartTs = e.startTs;
    this.tracesRangeEndTs = e.endTs;
    this.applyTracesRange();
  }

  /** Rebuild the Execution Paths filter state: global dimension filters + the Paths time range (new object so
   *  the child view's ngOnChanges fires and it re-fetches). */
  private applyPathsRange(): void {
    if (!this.filterState) {
      this.pathsFilterState = null;
      return;
    }
    this.pathsFilterState = { ...this.filterState, startTs: this.pathsRangeStartTs, endTs: this.pathsRangeEndTs };
    this.cdr.detectChanges();
  }

  /** Rebuild the Traces filter state: global dimension filters + the Traces time range. */
  private applyTracesRange(): void {
    if (!this.filterState) {
      this.tracesFilterState = null;
      return;
    }
    this.tracesFilterState = { ...this.filterState, startTs: this.tracesRangeStartTs, endTs: this.tracesRangeEndTs };
    this.cdr.detectChanges();
  }

  // ── sibling-view navigation ─────────────────────────────────────────────────

  get showDetails(): boolean {
    return !!this.detailTrace || this.detailLoading;
  }

  setView(view: TracingView): void {
    this.activeView = view;
    this.detailTrace = null;
    this.detailLoading = false;
    this.cdr.detectChanges();
    if (view === 'traces') {
      this.tracesComp?.reload();   // load/refresh the trace list when the Traces tab is opened
    }
  }

  /** From Execution Paths "View traces"/Saved Traces: seed the Traces range from the Execution Paths window (so
   *  the drilled-in traces match what the user was viewing), then switch to the Traces view filtered to that path.
   *  A plain tab switch (setView) does NOT do this — only an explicit drill-down. */
  onViewTraces(ref: ExecutionPathRef): void {
    if (this.pathsRangePreset === 'custom') {
      // paths picker is day-granular ("YYYY-MM-DD"); widen to datetime-local for the time-granular Traces picker
      this.tracesRangePreset = 'custom';
      this.tracesRangeCustomStart = this.pathsRangeCustomStart ? `${this.pathsRangeCustomStart}T00:00` : '';
      this.tracesRangeCustomEnd = this.pathsRangeCustomEnd ? `${this.pathsRangeCustomEnd}T23:59` : '';
    } else {
      this.tracesRangePreset = this.pathsRangePreset;
      this.tracesRangeCustomStart = '';
      this.tracesRangeCustomEnd = '';
    }
    this.tracesRangeStartTs = this.pathsRangeStartTs;
    this.tracesRangeEndTs = this.pathsRangeEndTs;
    this.applyTracesRange();

    this.pathFilter = ref;
    this.activeView = 'traces';
    this.detailTrace = null;
    this.cdr.detectChanges();
    this.tracesComp?.reload();
  }

  onClearPathFilter(): void {
    this.pathFilter = null;
    this.cdr.detectChanges();
  }

  /** Open the shared Trace Details view for a trace id (from either sibling flow). */
  onOpenTrace(traceId: string): void {
    if (!this.service) { return; }
    this.detailLoading = true;
    this.cdr.detectChanges();
    this.service.getTrace(traceId).subscribe({
      next: detail => {
        this.detailTrace = detail;
        this.detailLoading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.detailLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  /** Back from Trace Details → return to the sibling view that was active (filters preserved there). */
  onBackFromDetails(): void {
    this.detailTrace = null;
    this.detailLoading = false;
    this.cdr.detectChanges();
  }

  // ── Trace settings (moved here so both sibling views share one header) ──────

  private loadSettings(): void {
    this.service?.getTraceSettings().subscribe({
      next: s => { this.settings = s; this.cdr.detectChanges(); },
      error: () => { /* leave header showing nothing until settings load */ },
    });
  }

  openSettings(): void {
    if (!this.settings) { return; }
    this.draft = { ...this.settings };
    this.sampleUnit = 'minutes';
    this.settingsOpen = true;
    this.cdr.detectChanges();
  }

  get switchMinutes(): number | null {
    if (!this.draft) { return null; }
    return this.draft.ruleEngineSwitchInterval / 60;
  }
  set switchMinutes(v: number | null) {
    if (!this.draft) { return; }
    this.draft.ruleEngineSwitchInterval = (v ?? 0) * 60;
  }

  get sampleValue(): number | null {
    if (!this.draft) { return null; }
    return this.sampleUnit === 'minutes' ? this.draft.relatedTraceSampleInterval / 60 : this.draft.relatedTraceSampleInterval;
  }
  set sampleValue(v: number | null) {
    if (!this.draft) { return; }
    const n = v ?? 0;
    this.draft.relatedTraceSampleInterval = this.sampleUnit === 'minutes' ? n * 60 : n;
  }

  /** "Max traces per message pack" unlimited toggle — stored as tracesPerPack = 0 (semantics preserved). */
  get packUnlimited(): boolean {
    return this.draft?.tracesPerPack === 0;
  }
  set packUnlimited(v: boolean) {
    if (!this.draft) { return; }
    if (v) {
      this.draft.tracesPerPack = 0;
    } else if (this.draft.tracesPerPack <= 0) {
      this.draft.tracesPerPack = 1;
    }
  }

  /** "Max trace groups per day" unlimited toggle — stored as maxTraceGroupsPerDay = 0 (semantics preserved). */
  get groupsUnlimited(): boolean {
    return this.draft?.maxTraceGroupsPerDay === 0;
  }
  set groupsUnlimited(v: boolean) {
    if (!this.draft) { return; }
    if (v) {
      this.draft.maxTraceGroupsPerDay = 0;
    } else if (this.draft.maxTraceGroupsPerDay <= 0) {
      this.draft.maxTraceGroupsPerDay = 1;
    }
  }

  closeSettings(): void {
    this.settingsOpen = false;
    this.draft = null;
    this.cdr.detectChanges();
  }

  fieldInvalid(value: number | null | undefined): boolean {
    return !!this.draft?.enabled && (value === null || value === undefined || !(value > 0));
  }

  // tracesPerPack: "Unlimited" stores 0 (always valid); otherwise it must be a positive whole number.
  packCountInvalid(value: number | null | undefined): boolean {
    if (!this.draft?.enabled || this.packUnlimited) { return false; }
    return value === null || value === undefined || value < 1 || !Number.isInteger(value);
  }

  // maxTraceGroupsPerDay: "Unlimited" stores 0 (always valid); otherwise it must be a positive whole number.
  groupsCountInvalid(value: number | null | undefined): boolean {
    if (!this.draft?.enabled || this.groupsUnlimited) { return false; }
    return value === null || value === undefined || value < 1 || !Number.isInteger(value);
  }

  get settingsValid(): boolean {
    if (!this.draft) { return false; }
    if (!this.draft.enabled) { return true; }
    return !this.fieldInvalid(this.draft.tracesPerInterval)
      && !this.packCountInvalid(this.draft.tracesPerPack)
      && !this.groupsCountInvalid(this.draft.maxTraceGroupsPerDay)
      && !this.fieldInvalid(this.draft.interval)
      && !this.fieldInvalid(this.draft.relatedTraceSampleInterval)
      && (!this.draft.ruleEngineRotation || !this.fieldInvalid(this.draft.ruleEngineSwitchInterval));
  }

  saveSettings(): void {
    if (!this.draft || !this.service || !this.settingsValid) { return; }
    this.settingsSaving = true;
    this.service.saveTraceSettings(this.draft).subscribe({
      next: s => {
        this.settings = s;
        this.settingsSaving = false;
        this.settingsOpen = false;
        this.draft = null;
        this.cdr.detectChanges();
      },
      error: () => { this.settingsSaving = false; this.cdr.detectChanges(); },
    });
  }
}
