import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { SharedModule } from '@shared/public-api';
import {
  BasicWidgetConfigModule,
  HomeComponentsModule,
  WidgetConfigComponentsModule
} from '@home/components/public-api';
import { RuleEngineMonitoringComponent } from './rule-engine-monitoring/rule-engine-monitoring.component';
import { FilterBarComponent } from './rule-engine-monitoring/filter-bar.component';
import { KpiCardsComponent } from './rule-engine-monitoring/kpi-cards.component';
import { TrendChartComponent } from './rule-engine-monitoring/trend-chart.component';
import { StatTableComponent } from './rule-engine-monitoring/stat-table.component';
import { ExecutionPathsComponent } from './rule-engine-monitoring/execution-paths.component';
import { TracingComponent } from './rule-engine-monitoring/tracing.component';
import { TracesComponent } from './rule-engine-monitoring/traces.component';
import { TraceDetailsComponent } from './rule-engine-monitoring/trace-details.component';
import { PaginatorComponent } from './rule-engine-monitoring/paginator.component';
import { TimeRangeSelectorComponent } from './rule-engine-monitoring/time-range-selector.component';

@NgModule({
  declarations: [
    RuleEngineMonitoringComponent,
    FilterBarComponent,
    KpiCardsComponent,
    TrendChartComponent,
    StatTableComponent,
    ExecutionPathsComponent,
    TracingComponent,
    TracesComponent,
    TraceDetailsComponent,
    PaginatorComponent,
    TimeRangeSelectorComponent,
  ],
  imports: [
    CommonModule,
    SharedModule,
    HomeComponentsModule,
    BasicWidgetConfigModule,
    WidgetConfigComponentsModule,
    MatExpansionModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatSnackBarModule
  ],
  exports: [
    RuleEngineMonitoringComponent,
    FilterBarComponent,
    KpiCardsComponent,
    TrendChartComponent,
    StatTableComponent,
    ExecutionPathsComponent,
    TracingComponent,
    TracesComponent,
    TraceDetailsComponent,
    PaginatorComponent,
  ]
})
export class ExamplesModule {
}
