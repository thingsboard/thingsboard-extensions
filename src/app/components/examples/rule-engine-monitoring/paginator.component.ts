import { Component, EventEmitter, Input, Output } from '@angular/core';

export const PAGE_SIZE_OPTIONS = [50, 100, 500, 1000];

/** Compact pagination control: rows-per-page selector, "start–end of total", and first/prev/next/last
 *  navigation. Stateless — the parent owns page/pageSize and re-renders the requested page. */
@Component({
  selector: 'tb-rem-paginator',
  templateUrl: './paginator.component.html',
  styleUrls: ['./paginator.component.scss'],
  standalone: false,
})
export class PaginatorComponent {

  @Input() total = 0;
  @Input() page = 0;                 // 0-based
  @Input() pageSize = PAGE_SIZE_OPTIONS[0];
  @Input() pageSizeOptions = PAGE_SIZE_OPTIONS;

  @Output() pageChange = new EventEmitter<number>();
  @Output() pageSizeChange = new EventEmitter<number>();

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }

  get rangeStart(): number {
    return this.total === 0 ? 0 : this.page * this.pageSize + 1;
  }

  get rangeEnd(): number {
    return Math.min(this.total, (this.page + 1) * this.pageSize);
  }

  first(): void { if (this.page > 0) { this.pageChange.emit(0); } }
  prev(): void { if (this.page > 0) { this.pageChange.emit(this.page - 1); } }
  next(): void { if (this.page < this.totalPages - 1) { this.pageChange.emit(this.page + 1); } }
  last(): void { if (this.page < this.totalPages - 1) { this.pageChange.emit(this.totalPages - 1); } }

  onSize(size: number): void {
    this.pageSizeChange.emit(size);
  }
}
