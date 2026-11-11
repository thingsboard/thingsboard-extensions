import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild
} from '@angular/core';
import { ApiSpanAttribute, SpanStatus, TraceDetail, TraceSpan } from './rule-engine-monitoring.models';
import { formatDuration } from './rule-engine-monitoring.utils';

interface TimelineMarker {
  pct: number;
  label: string;
}

interface SpanAttributeView {
  key: string;
  value: string;
  json: boolean;
}

// One depth-first row, shared by the Rule Nodes tree and the Timeline so their rows line up.
interface SpanRow {
  span: TraceSpan;
  level: number;
  hasChildren: boolean;
}

interface LegendItem {
  status: SpanStatus | 'retry';
  label: string;
}

const LEGEND: LegendItem[] = [
  { status: 'success', label: 'Success' },
  { status: 'error', label: 'Error' },
  { status: 'retry', label: 'Retry' },
  { status: 'timeoutCanceled', label: 'Timed out (canceled)' },
  { status: 'timeoutContinued', label: 'Timed out (continued)' },
];

@Component({
  selector: 'tb-rem-trace-details',
  templateUrl: './trace-details.component.html',
  styleUrls: ['./trace-details.component.scss'],
  standalone: false,
})
export class TraceDetailsComponent implements OnChanges, AfterViewInit, OnDestroy {

  @Input() trace: TraceDetail | null = null;

  /** Return to the trace list (keeps the list's filters/scroll, handled by the container). */
  @Output() back = new EventEmitter<void>();

  selectedSpan: TraceSpan | null = null;
  hoveredSpan: TraceSpan | null = null;   // shared so both panels highlight the same row
  copied = false;

  @ViewChild('treeRows') private treeRows?: ElementRef<HTMLElement>;
  @ViewChild('tlRows') private tlRows?: ElementRef<HTMLElement>;
  private syncingScroll = false;

  // ── details panel state (preserved across collapse/reopen) ──
  collapsed = false;          // header-only; keeps selectedSpan
  maximized = false;          // ~82% of the view
  detailHeightPx: number | null = null;   // custom height from dragging the resize handle

  readonly legend = LEGEND;
  readonly fmtDuration = formatDuration;

  private flat: SpanRow[] = [];
  private total = 0;
  private copiedTimer: ReturnType<typeof setTimeout> | null = null;

  // resize-drag bookkeeping
  private dragging = false;
  private dragStartY = 0;
  private dragStartHeight = 0;
  private userSelectRestore: Array<{ el: HTMLElement; userSelect: string; webkitUserSelect: string }> = [];
  private userSelectRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly selectionGestureGuard = (event: Event): void => {
    if (this.isSelectableDetailsEvent(event)) {
      event.stopPropagation();
    }
  };

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    this.enableTextSelectionInDashboardContainer();
    this.userSelectRefreshTimer = setTimeout(() => {
      this.enableTextSelectionInDashboardContainer();
      this.userSelectRefreshTimer = null;
    });
    document.addEventListener('mousedown', this.selectionGestureGuard, true);
    document.addEventListener('selectstart', this.selectionGestureGuard, true);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['trace']) {
      this.resetPanel();          // reset inspector when a different trace is opened
      this.rebuild();
    }
  }

  ngOnDestroy(): void {
    if (this.copiedTimer) {
      clearTimeout(this.copiedTimer);
    }
    if (this.userSelectRefreshTimer) {
      clearTimeout(this.userSelectRefreshTimer);
      this.userSelectRefreshTimer = null;
    }
    document.removeEventListener('mousedown', this.selectionGestureGuard, true);
    document.removeEventListener('selectstart', this.selectionGestureGuard, true);
    this.restoreDashboardUserSelectStyles();
  }

  /** Status message of the selected error span, shown as the exception. */
  get spanErrorMessage(): string | null {
    return this.selectedSpan?.error ? (this.selectedSpan.statusMessage ?? null) : null;
  }

  private resetPanel(): void {
    this.selectedSpan = null;
    this.collapsed = false;
    this.maximized = false;
    this.detailHeightPx = null;
  }

  // ── header metadata ─────────────────────────────────────────────────────────
  get traceId(): string { return this.trace?.traceId ?? '—'; }
  get startLabel(): string { return this.fmtTimestamp(this.trace?.startTs); }
  get endLabel(): string { return this.trace?.endTs ? this.fmtTimestamp(this.trace.endTs) : 'N/A'; }
  get durationLabel(): string { return formatDuration(this.trace?.durationMs ?? 0); }
  get inQueueLabel(): string { return this.trace?.inQueueTimeMs != null ? formatDuration(this.trace.inQueueTimeMs) : 'N/A'; }
  get spanTimeLabel(): string { return this.trace?.totalSpanTimeMs != null ? formatDuration(this.trace.totalSpanTimeMs) : 'N/A'; }
  get nodes(): number { return this.trace?.spanCount ?? 0; }
  get errors(): number { return this.trace?.errorCount ?? 0; }
  get retries(): number { return this.trace?.retriesCount ?? 0; }
  get timedOutCanceled(): number { return this.trace?.timedOutCanceledCount ?? 0; }
  get timedOutContinued(): number { return this.trace?.timedOutContinuedCount ?? 0; }

  copyTraceId(): void {
    if (!this.trace?.traceId) { return; }
    navigator.clipboard?.writeText(this.trace.traceId);
    this.copied = true;
    if (this.copiedTimer) { clearTimeout(this.copiedTimer); }
    this.copiedTimer = setTimeout(() => { this.copied = false; this.copiedTimer = null; }, 1200);
  }

  // ── rows shared by the tree + timeline ───────────────────────────────────────
  get rows(): SpanRow[] { return this.flat; }
  get totalMs(): number { return this.total; }

  timelineMarkers(): TimelineMarker[] {
    if (this.total <= 0) { return []; }
    return [0, 0.25, 0.5, 0.75, 1].map(f => ({ pct: f * 100, label: formatDuration(Math.round(this.total * f)) }));
  }

  barLeft(span: TraceSpan): number {
    return this.total > 0 ? Math.min(99.5, (span.startMs / this.total) * 100) : 0;
  }

  barWidth(span: TraceSpan): number {
    if (this.total <= 0) { return 0.5; }
    const left = this.barLeft(span);
    return Math.min(100 - left, Math.max(0.5, (span.durationMs / this.total) * 100));
  }

  /** Bar ends far enough right that its duration label should render to the left of the bar, so it
   *  stays inside the timeline width instead of overflowing the right edge. */
  barDurFlip(span: TraceSpan): boolean {
    return this.barLeft(span) + this.barWidth(span) > 75;
  }

  /** Left position (%) of the duration label: before the bar when flipped, otherwise after it. */
  barDurLeft(span: TraceSpan): number {
    return this.barDurFlip(span) ? this.barLeft(span) : this.barLeft(span) + this.barWidth(span);
  }

  /** Single status class for a tree row's left accent + tint (one legend colour per row).
   *  Precedence matches the timeline bar (error > canceled > continued), with retry as the overlay. */
  rowStatusClass(span: TraceSpan): string {
    if (span.status === 'error') { return 'rem-td-status-error'; }
    if (span.status === 'timeoutCanceled') { return 'rem-td-status-canceled'; }
    if (span.status === 'timeoutContinued') { return 'rem-td-status-continued'; }
    if (span.retry) { return 'rem-td-status-retry'; }
    return 'rem-td-status-success';
  }

  // ── selection + detail panel ─────────────────────────────────────────────────
  onSpanClick(span: TraceSpan): void {
    this.selectedSpan = span;
    this.collapsed = false;   // selecting always (re)opens the panel
  }

  isSelected(span: TraceSpan): boolean {
    return this.selectedSpan === span;
  }

  // shared hover so the matching row lights up on BOTH panels
  onRowEnter(span: TraceSpan): void { this.hoveredSpan = span; }
  onRowLeave(): void { this.hoveredSpan = null; }

  /** Keeps the Rule Nodes tree and Timeline scrolled in lockstep (rows are 1:1 and equal height). */
  onScroll(source: 'tree' | 'tl'): void {
    if (this.syncingScroll) { return; }
    const from = source === 'tree' ? this.treeRows : this.tlRows;
    const to = source === 'tree' ? this.tlRows : this.treeRows;
    if (!from || !to) { return; }
    this.syncingScroll = true;
    to.nativeElement.scrollTop = from.nativeElement.scrollTop;
    requestAnimationFrame(() => { this.syncingScroll = false; });
  }

  /** Collapse to a header-only bar, keeping the selected span so it reopens unchanged. */
  toggleCollapse(): void {
    this.collapsed = !this.collapsed;
    if (!this.collapsed) { this.maximized = false; }
  }

  onDetailHeaderDblClick(event: MouseEvent): void {
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) {
      return;
    }
    if (target?.closest('.rem-td-detail-title, .rem-td-detail-status, .rem-td-detail-dur')) {
      return;
    }
    if (window.getSelection()?.toString()) {
      return;
    }
    this.toggleCollapse();
  }

  stopDashboardDrag(event: MouseEvent): void {
    event.stopPropagation();
  }

  toggleMaximize(): void {
    this.maximized = !this.maximized;
    this.collapsed = false;
    this.detailHeightPx = null;   // maximize overrides any dragged height
  }

  /** Close clears the selection → back to the empty state. */
  closeDetail(): void {
    this.resetPanel();
  }

  /** Selected span's attributes as displayable key/value rows. */
  get selectedAttributes(): SpanAttributeView[] {
    return (this.selectedSpan?.attributes ?? []).map(a => this.toAttributeView(a));
  }

  /** Rule chain + node ids of the selected span (present only on rule-node spans), for the Open Rule Node link. */
  get ruleNodeLink(): { ruleChainId: string; ruleNodeId: string } | null {
    const attrs = this.selectedSpan?.attributes ?? [];
    const find = (key: string): string | null =>
      attrs.find(a => a.attributeKey === key)?.attributeValueString ?? null;
    const ruleChainId = find('rule.chain.id');
    const ruleNodeId = find('rule.node.id');
    return ruleChainId && ruleNodeId ? { ruleChainId, ruleNodeId } : null;
  }

  /** Opens the rule chain editor focused on this span's rule node (new tab), like the legacy widget. */
  openRuleNode(): void {
    const link = this.ruleNodeLink;
    if (!link) { return; }
    const url = `${window.location.origin}/ruleChains/${encodeURIComponent(link.ruleChainId)}` +
      `?ruleNodeId=${encodeURIComponent(link.ruleNodeId)}`;
    window.open(url, '_blank');
  }

  // ── resize handle (drag the divider between the trace view and the panel) ──
  startResize(event: MouseEvent): void {
    if (!this.selectedSpan || this.collapsed) { return; }
    this.dragging = true;
    this.maximized = false;
    this.dragStartY = event.clientY;
    this.dragStartHeight = this.detailHeightPx ?? this.currentPanelHeight();
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onDrag(event: MouseEvent): void {
    if (!this.dragging) { return; }
    const containerH = this.host.nativeElement.clientHeight || 0;
    const max = Math.max(120, containerH * 0.85);
    const next = this.dragStartHeight + (this.dragStartY - event.clientY);   // drag up grows
    this.detailHeightPx = Math.min(max, Math.max(120, next));
  }

  @HostListener('document:mouseup')
  endResize(): void {
    this.dragging = false;
  }

  private currentPanelHeight(): number {
    const el = this.host.nativeElement.querySelector('.rem-td-detail') as HTMLElement | null;
    return el?.clientHeight ?? 240;
  }

  private enableTextSelectionInDashboardContainer(): void {
    this.restoreDashboardUserSelectStyles();
    let el: HTMLElement | null = this.host.nativeElement;
    while (el) {
      this.userSelectRestore.push({
        el,
        userSelect: el.style.userSelect,
        webkitUserSelect: el.style.webkitUserSelect,
      });
      el.style.userSelect = 'text';
      el.style.webkitUserSelect = 'text';
      if (el.tagName.toLowerCase() === 'gridster') {
        break;
      }
      el = el.parentElement;
    }
  }

  private restoreDashboardUserSelectStyles(): void {
    for (const item of this.userSelectRestore) {
      item.el.style.userSelect = item.userSelect;
      item.el.style.webkitUserSelect = item.webkitUserSelect;
    }
    this.userSelectRestore = [];
  }

  private isSelectableDetailsEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null;
    if (!target || !this.host.nativeElement.contains(target)) {
      return false;
    }
    if (target.closest('button, .rem-td-resize, .rem-td-resize *')) {
      return false;
    }
    return !!target.closest('.rem-td-meta, .rem-td-detail-header, .rem-td-detail-body');
  }

  onBack(): void {
    this.resetPanel();
    this.back.emit();
  }

  // ── helpers ──────────────────────────────────────────────────────────────────
  private rebuild(): void {
    this.flat = [];
    let max = 0;
    const walk = (span: TraceSpan, level: number): void => {
      this.flat.push({ span, level, hasChildren: span.children.length > 0 });
      max = Math.max(max, span.startMs + span.durationMs);
      span.children.forEach(c => walk(c, level + 1));
    };
    (this.trace?.spans ?? []).forEach(s => walk(s, 0));
    this.total = max;
  }

  private attrValue(a: ApiSpanAttribute): string {
    if (a.attributeValueString != null && a.attributeValueString !== '') { return a.attributeValueString; }
    if (a.attributeValueNumber != null) { return String(a.attributeValueNumber); }
    if (a.attributeValueBoolean != null) { return String(a.attributeValueBoolean); }
    return '';
  }

  private toAttributeView(a: ApiSpanAttribute): SpanAttributeView {
    const value = this.attrValue(a);
    const formattedJson = this.formatJsonObjectOrArray(value);
    return {
      key: a.attributeKey,
      value: formattedJson ?? value,
      json: formattedJson !== null,
    };
  }

  private formatJsonObjectOrArray(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed === null || typeof parsed !== 'object') {
        return null;
      }
      return JSON.stringify(parsed, null, 2);
    } catch {
      return null;
    }
  }

  private fmtTimestamp(ts?: number | null): string {
    if (!ts) { return 'N/A'; }
    const d = new Date(ts);
    const pad = (n: number): string => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
      `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }
}
