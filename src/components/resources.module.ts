import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { ResourseAlarmsTableWidgetComponent } from './alarm/resource-alarms-table-widget.component';
import { ResourceFlotWidgetComponent } from './chart/resource-flot-widget.component';

@NgModule({
    declarations: [
        ResourseAlarmsTableWidgetComponent,
        ResourceFlotWidgetComponent
    ],
    imports: [
        CommonModule,
        SharedModule
    ],
    exports: [
        ResourseAlarmsTableWidgetComponent,
        ResourceFlotWidgetComponent
    ]
})

export class ResourcesModule {
}
