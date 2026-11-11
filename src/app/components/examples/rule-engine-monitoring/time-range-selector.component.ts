import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

interface TimePreset { label: string; value: string; ms: number; }

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Window length (ms) for each relative preset. 'custom' is absent (resolved from the picked dates).
const PRESET_MS: Record<string, number> = {
  '1h': HOUR_MS,
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
  '30d': 30 * DAY_MS,
};

/**
 * Resolves a relative preset to an absolute [startTs, endTs] anchored at the current time, so callers can
 * recompute the window on every fetch/refresh (e.g. "Last 24h" always ends at now). Returns null for 'custom'
 * or unknown presets — the caller should keep the explicitly picked window in that case.
 */
export function resolveRelativeRange(preset: string): { startTs: number; endTs: number } | null {
  const ms = PRESET_MS[preset];
  if (ms == null) { return null; }
  const endTs = Date.now();
  return { startTs: endTs - ms, endTs };
}

// Emitted whenever the selection changes: the raw selection (so callers can keep the picker in sync) plus the
// resolved absolute window.
export interface TimeRangeChange {
  preset: string;
  customStart: string;
  customEnd: string;
  startTs: number;
  endTs: number;
}

/**
 * Compact time-range picker (preset dropdown + custom datetime range), styled like the dashboard filter bar.
 * It is a controlled component: the current selection is supplied via inputs and changes are emitted back, so the
 * owner can share one range across several pickers (e.g. the Execution Paths and Traces toolbars).
 */
@Component({
  selector: 'tb-rem-time-range',
  templateUrl: './time-range-selector.component.html',
  styleUrls: ['./time-range-selector.component.scss'],
  standalone: false,
})
export class TimeRangeSelectorComponent implements OnInit {

  @Input() preset = '24h';
  @Input() customStart = '';
  @Input() customEnd = '';
  // 'time' → hour presets + datetime-local custom (default); 'day' → day presets + date-only custom
  @Input() granularity: 'time' | 'day' = 'time';

  @Output() rangeChange = new EventEmitter<TimeRangeChange>();

  readonly presets: TimePreset[] = [
    { label: 'Last 1h',  value: '1h',  ms: HOUR_MS },
    { label: 'Last 24h', value: '24h', ms: DAY_MS },
    { label: 'Last 7d',  value: '7d',  ms: 7 * DAY_MS },
    { label: 'Last 30d', value: '30d', ms: 30 * DAY_MS },
    { label: 'Custom',   value: 'custom', ms: 0 },
  ];

  // day labels for day granularity (24h reads as "1 day")
  private static readonly DAY_LABELS: Record<string, string> = {
    '24h': 'Last 1 day', '7d': 'Last 7 days', '30d': 'Last 30 days', 'custom': 'Custom',
  };

  /** Presets offered for the current granularity, computed ONCE in ngOnInit. Must be a stable array reference —
   *  a getter that rebuilt the array every change-detection cycle made <mat-select> re-init its options each CD,
   *  causing an infinite change-detection loop that froze the page. */
  visiblePresets: TimePreset[] = this.presets;

  ngOnInit(): void {
    if (this.granularity === 'day') {
      this.visiblePresets = this.presets
        .filter(p => p.ms === 0 || p.ms % DAY_MS === 0)
        .map(p => ({ ...p, label: TimeRangeSelectorComponent.DAY_LABELS[p.value] ?? p.label }));
    }
  }

  get showCustomRange(): boolean {
    return this.preset === 'custom';
  }

  onPresetChange(): void {
    if (this.preset === 'custom' && !this.customStart) {
      const now = new Date();
      if (this.granularity === 'day') {
        this.customEnd = toDateLocal(now);
        this.customStart = toDateLocal(new Date(now.getTime() - DAY_MS));
      } else {
        this.customEnd = toDatetimeLocal(now);
        this.customStart = toDatetimeLocal(new Date(now.getTime() - DAY_MS));
      }
    }
    this.emit();
  }

  onCustomRangeChange(): void {
    if (this.customStart && this.customEnd) {
      this.emit();
    }
  }

  private emit(): void {
    const { startTs, endTs } = this.computeRange();
    this.rangeChange.emit({ preset: this.preset, customStart: this.customStart, customEnd: this.customEnd, startTs, endTs });
  }

  private computeRange(): { startTs: number; endTs: number } {
    if (this.preset === 'custom' && this.customStart && this.customEnd) {
      if (this.granularity === 'day') {
        // date-only inputs: span the whole selected days (00:00:00.000 → 23:59:59.999, local time)
        return {
          startTs: new Date(`${this.customStart}T00:00:00.000`).getTime(),
          endTs: new Date(`${this.customEnd}T23:59:59.999`).getTime(),
        };
      }
      return { startTs: new Date(this.customStart).getTime(), endTs: new Date(this.customEnd).getTime() };
    }
    const preset = this.presets.find(p => p.value === this.preset) ?? this.presets[1];
    const endTs = Date.now();
    return { startTs: endTs - preset.ms, endTs };
  }
}

function toDatetimeLocal(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toDateLocal(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
