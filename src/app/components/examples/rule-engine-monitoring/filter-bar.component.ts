import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { FilterOptions, FilterState, QueueOption, RuleChainOption, RuleNodeOption } from './rule-engine-monitoring.models';

interface TimePreset {
  label: string;
  value: string;
  ms: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const SYS_TENANT_ID = '13814000-1dd2-11b2-8080-808080808080';

@Component({
  selector: 'tb-rem-filter-bar',
  templateUrl: './filter-bar.component.html',
  styleUrls: ['./filter-bar.component.scss'],
  standalone: false
})
export class FilterBarComponent implements OnInit, OnChanges {

  @Input() filterOptions: FilterOptions | null = null;
  @Input() locked = false;
  @Input() externalFilterState: FilterState | null = null;

  @Output() filterChange = new EventEmitter<FilterState>();
  @Output() resetClick = new EventEmitter<void>();
  @Output() compareToggle = new EventEmitter<boolean>();
  @Output() refreshClick = new EventEmitter<void>();

  readonly presets: TimePreset[] = [
    { label: 'Last 1h',  value: '1h',  ms: HOUR_MS },
    { label: 'Last 24h', value: '24h', ms: DAY_MS },
    { label: 'Last 7d',  value: '7d',  ms: 7 * DAY_MS },
    { label: 'Last 30d', value: '30d', ms: 30 * DAY_MS },
    { label: 'Custom',   value: 'custom', ms: 0 },
  ];

  activePreset = '24h';
  customStart = '';
  customEnd = '';

  get showCustomRange(): boolean {
    return this.activePreset === 'custom';
  }

  selectedQueueIds: string[] = [];
  selectedChainIds: string[] = [];
  selectedNodeIds: string[] = [];
  selectedServiceIds: string[] = [];

  queueSearch = '';
  chainSearch = '';
  nodeSearch = '';
  serviceSearch = '';

  // Manually added (ad-hoc) entries — typed text is used as both id and name
  customQueues: QueueOption[] = [];
  customChains: RuleChainOption[] = [];
  customNodes: RuleNodeOption[] = [];
  customServices: string[] = [];

  compareActive = false;

  queueLabel(q: QueueOption): string {
    return q.tenantId === SYS_TENANT_ID ? `${q.name} [sys]` : q.name;
  }

  get filteredQueues(): QueueOption[] {
    if (!this.filterOptions) { return []; }
    const all = [...this.customQueues, ...this.filterOptions.queues];
    const q = this.queueSearch.toLowerCase();
    return q ? all.filter(o => o.name.toLowerCase().includes(q)) : all;
  }

  get filteredChains(): RuleChainOption[] {
    if (!this.filterOptions) { return []; }
    const all = [...this.customChains, ...this.filterOptions.ruleChains];
    const q = this.chainSearch.toLowerCase();
    return q ? all.filter(o => o.name.toLowerCase().includes(q)) : all;
  }

  get visibleNodes(): RuleNodeOption[] {
    if (!this.filterOptions) { return []; }
    // Custom nodes are always visible — their rule chain is unknown
    let nodes = this.selectedChainIds.length
      ? this.filterOptions.ruleNodes.filter(n => this.selectedChainIds.includes(n.ruleChainId))
      : this.filterOptions.ruleNodes;
    nodes = [...this.customNodes, ...nodes];
    const q = this.nodeSearch.toLowerCase();
    return q
      ? nodes.filter(n => n.name.toLowerCase().includes(q) || n.ruleChainName.toLowerCase().includes(q))
      : nodes;
  }

  get filteredServices(): string[] {
    if (!this.filterOptions) { return []; }
    const all = [...this.customServices, ...(this.filterOptions.serviceIds ?? [])];
    const q = this.serviceSearch.toLowerCase();
    return q ? all.filter(s => s.toLowerCase().includes(q)) : all;
  }

  canAddQueue(): boolean {
    const t = this.queueSearch.trim();
    return !!t && ![...this.customQueues, ...(this.filterOptions?.queues ?? [])]
      .some(o => o.name === t || o.id === t);
  }

  addCustomQueue(): void {
    const t = this.queueSearch.trim();
    if (!t) { return; }
    this.customQueues.push({ id: t, name: t, tenantId: null });
    this.selectedQueueIds = [...this.selectedQueueIds, t];
    this.queueSearch = '';
    this.emitFilterChange();
  }

  canAddChain(): boolean {
    const t = this.chainSearch.trim();
    return !!t && ![...this.customChains, ...(this.filterOptions?.ruleChains ?? [])]
      .some(o => o.name === t || o.id === t);
  }

  addCustomChain(): void {
    const t = this.chainSearch.trim();
    if (!t) { return; }
    this.customChains.push({ id: t, name: t });
    this.selectedChainIds = [...this.selectedChainIds, t];
    this.chainSearch = '';
    this.emitFilterChange();
  }

  canAddNode(): boolean {
    const t = this.nodeSearch.trim();
    return !!t && ![...this.customNodes, ...(this.filterOptions?.ruleNodes ?? [])]
      .some(o => o.name === t || o.id === t);
  }

  addCustomNode(): void {
    const t = this.nodeSearch.trim();
    if (!t) { return; }
    this.customNodes.push({ id: t, name: t, ruleChainId: '', ruleChainName: 'manual' });
    this.selectedNodeIds = [...this.selectedNodeIds, t];
    this.nodeSearch = '';
    this.emitFilterChange();
  }

  canAddService(): boolean {
    const t = this.serviceSearch.trim();
    return !!t && ![...this.customServices, ...(this.filterOptions?.serviceIds ?? [])].includes(t);
  }

  addCustomService(): void {
    const t = this.serviceSearch.trim();
    if (!t) { return; }
    this.customServices.push(t);
    this.selectedServiceIds = [...this.selectedServiceIds, t];
    this.serviceSearch = '';
    this.emitFilterChange();
  }

  ngOnInit(): void {
    this.emitFilterChange();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['locked'] && !this.locked) {
      this.compareActive = false;
    }
    if (changes['externalFilterState'] && this.externalFilterState) {
      this.selectedQueueIds = [...(this.externalFilterState.queueIds     ?? [])];
      this.selectedChainIds = [...(this.externalFilterState.ruleChainIds ?? [])];
      this.selectedNodeIds  = [...(this.externalFilterState.ruleNodeIds  ?? [])];
      this.selectedServiceIds = [...(this.externalFilterState.serviceIds ?? [])];
    }
  }

  onTimeRangeChange(): void {
    if (this.activePreset === 'custom' && !this.customStart) {
      const now = new Date();
      this.customEnd = toDatetimeLocal(now);
      this.customStart = toDatetimeLocal(new Date(now.getTime() - DAY_MS));
    }
    this.emitFilterChange();
  }

  onCustomRangeChange(): void {
    if (this.customStart && this.customEnd) {
      this.emitFilterChange();
    }
  }

  onQueueChange(): void {
    this.emitFilterChange();
  }

  onChainChange(): void {
    if (this.selectedChainIds.length && this.filterOptions) {
      const allowed = new Set([
        ...this.filterOptions.ruleNodes
          .filter(n => this.selectedChainIds.includes(n.ruleChainId))
          .map(n => n.id),
        ...this.customNodes.map(n => n.id), // manual nodes are never pruned
      ]);
      this.selectedNodeIds = this.selectedNodeIds.filter(id => allowed.has(id));
    }
    this.emitFilterChange();
  }

  onNodeChange(): void {
    this.emitFilterChange();
  }

  onServiceChange(): void {
    this.emitFilterChange();
  }

  /** Reload everything with current state: refresh filter options + re-emit the filter (which
   *  recomputes rolling time ranges). Invoked by the parent when refresh fires from the chart. */
  triggerReload(): void {
    this.refreshClick.emit();
    this.emitFilterChange();
  }

  onReset(): void {
    if (this.locked) {
      // In compare mode the filter selections are locked — just signal the parent to reset
      this.resetClick.emit();
      return;
    }
    this.selectedQueueIds   = [];
    this.selectedChainIds   = [];
    this.selectedNodeIds    = [];
    this.selectedServiceIds = [];
    this.queueSearch   = '';
    this.chainSearch   = '';
    this.nodeSearch    = '';
    this.serviceSearch = '';
    this.customQueues   = [];
    this.customChains   = [];
    this.customNodes    = [];
    this.customServices = [];
    this.emitFilterChange();
    this.resetClick.emit();
  }

  onCompareToggle(): void {
    this.compareActive = !this.compareActive;
    this.compareToggle.emit(this.compareActive);
  }

  private emitFilterChange(): void {
    const { startTs, endTs } = this.computeTimeRange();
    this.filterChange.emit({
      startTs,
      endTs,
      queueIds:    [...this.selectedQueueIds],
      ruleChainIds:[...this.selectedChainIds],
      ruleNodeIds: [...this.selectedNodeIds],
      serviceIds:  [...this.selectedServiceIds],
    });
  }

  private computeTimeRange(): { startTs: number; endTs: number } {
    if (this.activePreset === 'custom' && this.customStart && this.customEnd) {
      return {
        startTs: new Date(this.customStart).getTime(),
        endTs: new Date(this.customEnd).getTime(),
      };
    }
    const preset = this.presets.find(p => p.value === this.activePreset) ?? this.presets[1];
    const endTs = Date.now();
    return { startTs: endTs - preset.ms, endTs };
  }
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
