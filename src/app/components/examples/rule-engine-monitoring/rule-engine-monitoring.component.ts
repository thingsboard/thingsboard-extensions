import { Component, ElementRef, HostListener, Injector, Input, OnInit, ViewChild } from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';
import { CompareState, FilterOptions, FilterState } from './rule-engine-monitoring.models';
import { RuleEngineMonitoringWidgetService, RuleEngineHttpError } from './rule-engine-monitoring.service';
import { FilterBarComponent } from './filter-bar.component';

const SYS_TENANT_ID = '13814000-1dd2-11b2-8080-808080808080';

// Drill-down dimensions, ordered as a hierarchy: clicking a breadcrumb keeps this dimension and
// everything before it, and clears everything after it.
type DrillType = 'queue' | 'ruleChain' | 'ruleNode' | 'service';

interface DrillDim {
  type: DrillType;
  prefix: string;                  // breadcrumb label prefix, e.g. "Queue"
  field: keyof Pick<FilterState, 'queueIds' | 'ruleChainIds' | 'ruleNodeIds' | 'serviceIds'>;
}

const DRILL_DIMS: DrillDim[] = [
  { type: 'queue',     prefix: 'Queue',      field: 'queueIds' },
  { type: 'ruleChain', prefix: 'Rule Chain', field: 'ruleChainIds' },
  { type: 'ruleNode',  prefix: 'Rule Node',  field: 'ruleNodeIds' },
  { type: 'service',   prefix: 'Service',    field: 'serviceIds' },
];

export interface BreadcrumbItem {
  type: DrillType;
  prefix: string;
  label: string;
}

@Component({
  selector: 'tb-rule-engine-monitoring',
  templateUrl: 'rule-engine-monitoring.component.html',
  styleUrls: ['rule-engine-monitoring.component.scss'],
  standalone: false
})
export class RuleEngineMonitoringComponent implements OnInit {

  @Input() ctx: WidgetContext;

  @ViewChild(FilterBarComponent) private filterBar?: FilterBarComponent;

  filterOptions: FilterOptions | null = null;
  filterState: FilterState | null = null;
  compareState: CompareState | null = null;
  compareActive = false;
  rangeSelectActive = false;
  errorMessage: string | null = null;
  injector: Injector | null = null;

  // top-level dashboard tab; both panels stay mounted (toggled via [hidden]) so filters, pagination,
  // the selected nested tab, and scroll position survive switching. Performance is selected by default.
  activeDashboard: 'performance' | 'tracing' = 'performance';

  // Width of the charts pane as a percentage of the bottom row; the table pane takes the rest.
  chartPanePct = 65;
  splitDragging = false;
  private splitStartX = 0;
  private splitStartPct = 65;

  private preCompareFilterState: FilterState | null = null;

  private service: RuleEngineMonitoringWidgetService;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.ctx.$scope.ruleEngineMonitoringWidget = this;
    this.injector = this.ctx.$injector;
    this.service = new RuleEngineMonitoringWidgetService(this.ctx.$injector);
    this.loadFilters();
  }

  onDataUpdated(): void {}

  onFilterChange(state: FilterState): void {
    this.filterState = { ...state };
    this.ctx.detectChanges();
  }

  onTableFilterChange(state: FilterState): void {
    this.filterState = { ...state };
    this.ctx.detectChanges();
  }

  onCompareToggle(active: boolean): void {
    this.compareActive = active;
    if (active) {
      this.preCompareFilterState = this.filterState ? { ...this.filterState } : null;
      this.compareState = { baseRange: null, compareRange: null };
      this.rangeSelectActive = true;
    } else {
      // Deactivate: clear compare state, disable brush, restore pre-compare filter
      this.compareState = null;
      this.rangeSelectActive = false;
      if (this.preCompareFilterState) {
        this.filterState = { ...this.preCompareFilterState };
        this.preCompareFilterState = null;
      }
    }
    this.ctx.detectChanges();
  }

  onRefreshClick(): void {
    this.loadFilters();
  }

  /** Refresh fired from the chart toolbar — reload everything with current state via the filter bar
   *  (reloads filter options and re-emits the filter, recomputing rolling time ranges). */
  onChartRefresh(): void {
    this.filterBar?.triggerReload();
  }

  onResetClick(): void {
    if (this.compareActive) {
      // In compare mode: clear selected ranges, go back to N/A / No data state, re-enable brush
      this.compareState = { baseRange: null, compareRange: null };
      this.rangeSelectActive = true;
    }
    // Normal mode: filter bar already cleared dimension selections and emitted filterChange
    this.ctx.detectChanges();
  }

  /** Drill-down path derived from the current entity filters (queue → rule chain → rule node →
   *  service). Auto-syncs with both table row clicks and manual dropdown changes. */
  get breadcrumbItems(): BreadcrumbItem[] {
    const fs = this.filterState;
    if (!fs) return [];
    const items: BreadcrumbItem[] = [];
    for (const dim of DRILL_DIMS) {
      const ids = fs[dim.field] ?? [];
      if (ids.length) {
        items.push({ type: dim.type, prefix: dim.prefix, label: this.resolveDrillLabel(dim.type, ids) });
      }
    }
    return items;
  }

  /** "All" → clear every drill-down entity filter, keeping time range, interval, etc. */
  onBreadcrumbAll(): void {
    if (!this.filterState || this.compareActive) return;
    this.filterState = {
      ...this.filterState,
      queueIds: [], ruleChainIds: [], ruleNodeIds: [], serviceIds: [],
    };
    this.ctx.detectChanges();
  }

  /** Click an intermediate crumb → keep that dimension and earlier ones, clear deeper ones. */
  onBreadcrumbClick(type: DrillType): void {
    if (!this.filterState || this.compareActive) return;
    const idx = DRILL_DIMS.findIndex(d => d.type === type);
    if (idx < 0) return;
    const update: FilterState = { ...this.filterState };
    DRILL_DIMS.forEach((dim, i) => {
      if (i > idx) update[dim.field] = [];
    });
    this.filterState = update;
    this.ctx.detectChanges();
  }

  private resolveDrillLabel(type: DrillType, ids: string[]): string {
    const opts = this.filterOptions;
    const resolve = (id: string): string => {
      switch (type) {
        case 'queue':     return opts?.queues.find(q => q.id === id)?.name     ?? id;
        case 'ruleChain': return opts?.ruleChains.find(c => c.id === id)?.name ?? id;
        case 'ruleNode':  return opts?.ruleNodes.find(n => n.id === id)?.name  ?? id;
        case 'service':   return id;
      }
    };
    return ids.map(resolve).join(', ');
  }

  onRangeSelected(range: { start: number; end: number }): void {
    if (!this.compareState) return;

    if (this.compareState.baseRange === null) {
      // First brush — store as base range; KPI cards and table fetch for this range
      this.compareState = { baseRange: { startTs: range.start, endTs: range.end }, compareRange: null };
    } else if (this.compareState.compareRange === null) {
      // Second brush — store as compare range, disable brush, trigger delta display
      this.compareState = { ...this.compareState, compareRange: { startTs: range.start, endTs: range.end } };
      this.rangeSelectActive = false;
    }
    this.ctx.detectChanges();
  }

  private loadFilters(): void {
    this.service.getFilters().subscribe({
      next: opts => {
        opts.queues.sort((a, b) => {
          const aSys = a.tenantId === SYS_TENANT_ID ? 0 : 1;
          const bSys = b.tenantId === SYS_TENANT_ID ? 0 : 1;
          return aSys - bSys || a.name.localeCompare(b.name);
        });
        opts.ruleChains.sort((a, b) => a.name.localeCompare(b.name));
        opts.ruleNodes.sort((a, b) => a.ruleChainName.localeCompare(b.ruleChainName) || a.name.localeCompare(b.name));
        this.filterOptions = opts;
        this.ctx.detectChanges();
      },
      error: (err: RuleEngineHttpError) => {
        this.errorMessage = err?.status === 401 || err?.status === 403
          ? 'Access denied. Please log in with sufficient permissions.'
          : 'Failed to load filter options.';
        this.ctx.detectChanges();
      }
    });
  }

  startSplitResize(event: MouseEvent): void {
    this.splitDragging = true;
    this.splitStartX = event.clientX;
    this.splitStartPct = this.chartPanePct;
    // Keep the gesture here: without this the surrounding ThingsBoard dashboard starts dragging the widget.
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('document:mousemove', ['$event'])
  onSplitDrag(event: MouseEvent): void {
    if (!this.splitDragging) { return; }
    const row = this.host.nativeElement.querySelector('.rem-bottom-row') as HTMLElement | null;
    const width = row?.clientWidth ?? 0;
    if (!width) { return; }
    const deltaPct = ((event.clientX - this.splitStartX) / width) * 100;
    this.chartPanePct = Math.min(85, Math.max(20, this.splitStartPct + deltaPct));
  }

  @HostListener('document:mouseup')
  endSplitResize(): void {
    this.splitDragging = false;
  }

  /** Double-click the divider to return to the default split. */
  resetSplit(): void {
    this.chartPanePct = 65;
  }
}
