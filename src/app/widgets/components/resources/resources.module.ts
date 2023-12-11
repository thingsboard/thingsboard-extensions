import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule} from '@home/components/public-api';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';
import { ResourseAlarmsTableWidgetComponent } from './alarm/resource-alarms-table-widget.component';
import { ResourceFlotWidgetComponent } from './chart/resource-flot-widget.component';

@NgModule({
    declarations: [
        ResourseAlarmsTableWidgetComponent
    ],
    imports: [
        CommonModule,
        SharedModule,
        ButtonModule,
        AccordionModule,
        HomeComponentsModule
    ],
    exports: [
        ResourseAlarmsTableWidgetComponent
    ]
})

export class ResourcesModule {
}
