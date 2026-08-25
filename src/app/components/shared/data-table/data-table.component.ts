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

import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ContentChildren,
  Directive,
  ElementRef,
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  Output,
  QueryList,
  SimpleChanges,
  TemplateRef,
  ViewChild,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatTableDataSource } from "@angular/material/table";
import { MatPaginator } from "@angular/material/paginator";
import { SharedModule } from "@shared/public-api";
import { CopyBoxComponent } from "../copy-box/copy-box.component";
import { WidgetHeaderComponent } from "../widget-header/widget-header.component";

/**
 * Marks an `<ng-template>` as the custom cell renderer for a {@link DataTableComponent}
 * column. The template's implicit context is the row.
 *
 * ```html
 * <tb-data-table [columns]="cols" [rows]="rows">
 *   <ng-template tbDataTableCell="status" let-row>…</ng-template>
 * </tb-data-table>
 * ```
 */
@Directive({ selector: "[tbDataTableCell]", standalone: true })
export class DataTableCellDirective {
  /** Key of the column this template renders. */
  @Input("tbDataTableCell") column = "";

  constructor(public readonly template: TemplateRef<{ $implicit: Record<string, any>; row: Record<string, any> }>) {}
}

/** Column definition for {@link DataTableComponent}. */
export interface DataTableColumn {
  /** Row property rendered in the cell. */
  key: string;
  /** Column header label. */
  header: string;
  /** Render the value as a status chip instead of plain text. */
  chip?: boolean;
  /** Boolean row property controlling the chip's active/inactive style. */
  chipActiveKey?: string;
  /**
   * Render a two-line "primary" cell: {@link key} as the title and this row
   * property as the muted sub-label beneath it.
   */
  subtitleKey?: string;
  /** Horizontal alignment of the column's header and cells (defaults to left). */
  align?: "left" | "right";
  /** Render the value inside a monospace copy-to-clipboard box. */
  copyable?: boolean;
  /** Fixed width for the copy box (CSS length) so it doesn't resize per value. */
  copyWidth?: string;
  /** Row property to copy to the clipboard (defaults to the displayed value). */
  copyValueKey?: string;
}

/** Header action button for {@link DataTableComponent}. */
export interface DataTableAction {
  /** Identifier emitted via {@link DataTableComponent.actionClick} when clicked. */
  id: string;
  /** Material icon name. */
  icon: string;
  /** Tooltip / accessible label. */
  tooltip?: string;
  /** Render the button in its active (highlighted) state. */
  active?: boolean;
}

/**
 * Reusable, themed data table: card header (icon badge + title), toggleable
 * search, fixed-height scrolling mat-table with text/chip columns, and a
 * paginator. Styling uses the dashboard's `--c-*` theme tokens (inherited from
 * an ancestor), so it adapts to light/dark.
 */
@Component({
  selector: "tb-data-table",
  templateUrl: "./data-table.component.html",
  styleUrls: ["./data-table.component.scss"],
  standalone: true,
  imports: [CommonModule, SharedModule, CopyBoxComponent, WidgetHeaderComponent],
})
export class DataTableComponent implements OnChanges, AfterViewInit {
  /**
   * Strip the native `title` attribute off the host. The `title` @Input is set
   * via `title="…"` on the host element, but `title` is also a global HTML
   * attribute, so the browser would otherwise render its own tooltip with that
   * text on top of any matTooltip.
   */
  @HostBinding("attr.title") readonly hostTitle: string | null = null;

  @Input() title = "";
  @Input() icon = "table_rows";
  @Input() columns: DataTableColumn[] = [];
  @Input() rows: Record<string, any>[] = [];
  @Input() loading = false;
  @Input() emptyText = "No data";
  /** Optional Material icon shown above {@link emptyText} in the empty state. */
  @Input() emptyIcon = "";
  @Input() loadingText = "Loading…";
  @Input() searchEnabled = true;
  /** Render the search button before the action buttons (default: after). */
  @Input() searchFirst = false;
  /** Keep the card the same height whether the search bar is open or closed. */
  @Input() reserveSearchSpace = false;
  @Input() searchPlaceholder = "Search";
  /** Hide the whole card header (title + search + actions row). */
  @Input() showHeader = true;
  /** Render the title as a plain compact row (collapsible-card style: 14px
   *  bold, no icon badge, no actions/search) instead of the widget header. */
  @Input() compactHeader = false;
  /** Row properties included in the search filter (defaults to all column keys). */
  @Input() searchKeys: string[] = [];
  /** Hide the column header row (useful for single rich-cell tables). */
  @Input() showColumnHeaders = true;
  /**
   * Inset the row divider to match the cell padding (instead of spanning the full
   * width). Intended for single-column tables — on multi-column tables the inset
   * would leave gaps between columns.
   */
  @Input() insetRowDivider = false;
  /** Highlight rows on hover (turn off for tables whose rows aren't clickable,
   *  e.g. alarm lists where only the row's action buttons are interactive). */
  @Input() rowHover = true;
  /** Extra header action buttons, rendered left of the search button. */
  @Input() actions: DataTableAction[] = [];
  @Input() pageSize = 10;
  /**
   * Whether to paginate. When false, no paginator is shown and all rows render;
   * the scroll area grows with the content and the surrounding container scrolls
   * once it runs out of room.
   */
  @Input() paginated = true;
  /**
   * Size the scroll area to exactly {@link pageSize} rows (measured from a
   * rendered row), so a full page never scrolls and the card height stays
   * constant. Overrides the default fixed scroll height when set.
   */
  @Input() fitPageSize = false;
  /**
   * Row property used as a stable identity for the mat-table's `trackBy`. Set
   * this for tables fed by a live subscription so rows are reused (not
   * recreated) on each update — otherwise the hovered row's highlight blinks
   * when the data refreshes. Defaults to object-reference identity.
   */
  @Input() trackByKey?: string;
  /** Make rows clickable: shows a pointer, highlights the selected row, and emits {@link rowClick}. */
  @Input() selectable = false;
  /**
   * Add a leading checkbox column for bulk selection: a select-all header
   * checkbox (with an indeterminate state) and a per-row checkbox. Selection
   * survives live refreshes when {@link trackByKey} is set, and is reported via
   * {@link selectionChange}. Independent of {@link selectable}.
   */
  @Input() multiSelect = false;

  /** Emits the {@link DataTableAction.id} of a clicked header action. */
  @Output() actionClick = new EventEmitter<string>();
  /** Emits the clicked row (only when {@link selectable}). */
  @Output() rowClick = new EventEmitter<Record<string, any>>();
  /** Emits the currently checked rows whenever the multi-select selection changes. */
  @Output() selectionChange = new EventEmitter<Record<string, any>[]>();

  /** Keys ({@link rowKey}) of the rows checked in multi-select mode. */
  private checkedKeys = new Set<unknown>();

  @ViewChild("paginator") paginator!: MatPaginator;
  @ViewChild("searchInput") searchInput?: ElementRef<HTMLInputElement>;
  @ViewChild("scroll") scrollEl?: ElementRef<HTMLElement>;
  @ContentChildren(DataTableCellDirective) cellDefs?: QueryList<DataTableCellDirective>;

  dataSource = new MatTableDataSource<Record<string, any>>([]);
  searchOpen = false;
  /** Computed pixel height for the scroll area when {@link fitPageSize} is set. */
  fitHeightPx: number | null = null;
  /** Identity of the currently selected row (matched by {@link trackByKey}, so it
   *  survives live data refreshes). */
  selectedRowKey: unknown = null;

  constructor(private cd: ChangeDetectorRef) {}

  get columnKeys(): string[] {
    return this.columns.map((c) => c.key);
  }

  /** Columns rendered by the table — the checkbox column is prepended in multi-select mode. */
  get displayedColumns(): string[] {
    return this.multiSelect ? ["__select", ...this.columnKeys] : this.columnKeys;
  }

  trackByActionId(_: number, action: DataTableAction): string {
    return action.id;
  }

  /** mat-table trackBy: a stable row id when {@link trackByKey} is set, else the row itself. */
  trackByRow = (_: number, row: Record<string, any>): unknown => (this.trackByKey ? row[this.trackByKey] : row);

  /** Stable identity for a row (used for selection + trackBy). */
  private rowKey(row: Record<string, any>): unknown {
    return this.trackByKey ? row[this.trackByKey] : row;
  }

  /** Whether a row is the currently selected one. */
  isRowSelected(row: Record<string, any>): boolean {
    return this.selectable && this.selectedRowKey != null && this.rowKey(row) === this.selectedRowKey;
  }

  /** Select a clicked row and emit it (no-op when not {@link selectable}).
   *  In multi-select mode the click toggles the row's checkbox instead. */
  onRowClick(row: Record<string, any>): void {
    if (this.multiSelect) {
      this.toggleRow(row);
      return;
    }
    if (!this.selectable) {
      return;
    }
    this.selectedRowKey = this.rowKey(row);
    this.rowClick.emit(row);
  }

  /** Clear the row selection (e.g. when the consumer closes its detail panel). */
  clearSelection(): void {
    this.selectedRowKey = null;
  }

  // --- Multi-select (checkbox column) ---

  /**
   * Rows on the current page — the scope of the select-all checkbox. Falls back
   * to all filtered rows when there's no paginator (unpaginated tables).
   */
  private get pageRows(): Record<string, any>[] {
    const data = this.dataSource.filteredData ?? [];
    const paginator = this.dataSource.paginator;
    if (!paginator) {
      return data;
    }
    const start = paginator.pageIndex * paginator.pageSize;
    return data.slice(start, start + paginator.pageSize);
  }

  /** Whether a row's checkbox is ticked. */
  isChecked(row: Record<string, any>): boolean {
    return this.checkedKeys.has(this.rowKey(row));
  }

  /** All rows on the current page are checked (drives the header checkbox). */
  get allChecked(): boolean {
    const rows = this.pageRows;
    return rows.length > 0 && rows.every((r) => this.checkedKeys.has(this.rowKey(r)));
  }

  /** At least one row on the current page is checked (drives the indeterminate dash). */
  get someChecked(): boolean {
    return this.pageRows.some((r) => this.checkedKeys.has(this.rowKey(r)));
  }

  /** Toggle a single row's checkbox. */
  toggleRow(row: Record<string, any>): void {
    const key = this.rowKey(row);
    if (this.checkedKeys.has(key)) {
      this.checkedKeys.delete(key);
    } else {
      this.checkedKeys.add(key);
    }
    this.emitSelection();
  }

  /** Check or uncheck every row on the current page (the header select-all). */
  toggleAll(checked: boolean): void {
    for (const row of this.pageRows) {
      const key = this.rowKey(row);
      if (checked) {
        this.checkedKeys.add(key);
      } else {
        this.checkedKeys.delete(key);
      }
    }
    this.emitSelection();
  }

  /** The checked rows (resolved against the current data, so stale keys drop out). */
  get selectedRows(): Record<string, any>[] {
    return (this.rows ?? []).filter((r) => this.checkedKeys.has(this.rowKey(r)));
  }

  /** Clear the multi-select checkbox selection. */
  clearChecked(): void {
    if (this.checkedKeys.size === 0) {
      return;
    }
    this.checkedKeys.clear();
    this.emitSelection();
  }

  /**
   * Check or uncheck every (filtered) row — a global "select all" across pages,
   * distinct from the page-scoped header checkbox ({@link toggleAll}).
   */
  checkAll(checked: boolean): void {
    for (const row of this.dataSource.filteredData ?? []) {
      const key = this.rowKey(row);
      if (checked) {
        this.checkedKeys.add(key);
      } else {
        this.checkedKeys.delete(key);
      }
    }
    this.emitSelection();
  }

  private emitSelection(): void {
    this.selectionChange.emit(this.selectedRows);
  }

  /** Custom cell template for a column, if a consumer projected one. */
  cellTemplate(key: string): TemplateRef<any> | null {
    return this.cellDefs?.find((d) => d.column === key)?.template ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["rows"]) {
      this.dataSource.data = this.rows ?? [];
      // Re-measure once the new rows have rendered (the first batch usually
      // arrives asynchronously after init, and row height can change when the
      // icon font finishes loading).
      if (this.fitPageSize) {
        this.scheduleFitMeasure();
      }
    }
    if (changes["columns"] || changes["searchKeys"]) {
      const defaultKeys = this.columns.flatMap((c) => (c.subtitleKey ? [c.key, c.subtitleKey] : [c.key]));
      const keys = this.searchKeys.length ? this.searchKeys : defaultKeys;
      this.dataSource.filterPredicate = (row, filter) =>
        keys
          .map((k) => `${row[k] ?? ""}`)
          .join(" ")
          .toLowerCase()
          .includes(filter);
    }
  }

  ngAfterViewInit(): void {
    if (this.paginated) {
      this.dataSource.paginator = this.paginator;
    }
    if (this.fitPageSize) {
      this.scheduleFitMeasure();
    }
  }

  /**
   * Measure now, after the next frame, and again once the icon font has loaded —
   * the rendered row height grows when Material Symbols replaces the fallback
   * font, so an early single measurement would be too short.
   */
  private scheduleFitMeasure(): void {
    setTimeout(() => this.measureFitHeight());
    const fonts: any = (document as any).fonts;
    if (fonts?.ready?.then) {
      fonts.ready.then(() => this.measureFitHeight());
    }
  }

  /**
   * Set {@link fitHeightPx} to `pageSize × (rendered row height)` so a full page
   * fits exactly with no inner scroll and the height stays constant across
   * pages. No-op until at least one row is rendered.
   */
  private measureFitHeight(): void {
    const rows = this.scrollEl?.nativeElement.querySelectorAll<HTMLElement>("tr.mat-mdc-row");
    if (!rows?.length) {
      return;
    }
    // Use the tallest row to guard against a row that hasn't fully laid out yet;
    // rows are uniform in practice.
    let rowHeight = 0;
    rows.forEach((r) => (rowHeight = Math.max(rowHeight, r.offsetHeight)));
    // The (sticky) column-header row lives inside the scroll area, so the fit
    // height must include it or the last row gets clipped and scrolls. It's
    // offsetHeight 0 when hidden (display:none), so this is a no-op then.
    const headerRow = this.scrollEl?.nativeElement.querySelector<HTMLElement>("tr.mat-mdc-header-row");
    const headerHeight = headerRow?.offsetHeight ?? 0;
    const next = rowHeight * this.pageSize + headerHeight;
    if (next !== this.fitHeightPx) {
      this.fitHeightPx = next;
      this.cd.detectChanges();
    }
  }

  toggleSearch(): void {
    this.searchOpen = !this.searchOpen;
    if (this.searchOpen) {
      setTimeout(() => this.searchInput?.nativeElement.focus());
    } else {
      this.applyFilter("");
    }
  }

  applyFilter(value: string): void {
    this.dataSource.filter = value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
  }

  chipActive(row: Record<string, any>, col: DataTableColumn): boolean {
    return !!row[col.chipActiveKey ?? col.key];
  }
}
