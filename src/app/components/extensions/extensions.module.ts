import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { AlarmsTableWidgetComponent } from './alarm/alarms-table-widget.component';
import { FlotWidgetComponent } from './chart/flot-widget.component';

@NgModule({
    declarations: [
      AlarmsTableWidgetComponent,
      FlotWidgetComponent
    ],
    imports: [
      CommonModule,
      SharedModule
    ],
    exports: [
      AlarmsTableWidgetComponent,
      FlotWidgetComponent
    ]
})

export class ExtensionsModule {
}
