import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CustomAlarmsTableWidgetComponent } from "./custom-alarms-table-widget.component";
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { TranslateModule } from "@ngx-translate/core";
import { DisplayColumnsPanelComponent } from "./display-columns-panel.component";
import { AlarmFilterPanelComponent } from "./alarm-filter-panel.component";
import { AlarmDetailsDialogComponent } from "./alarm-details-dialog.component";

@NgModule({
  declarations: [
    CustomAlarmsTableWidgetComponent,
    DisplayColumnsPanelComponent,
    AlarmFilterPanelComponent,
    AlarmDetailsDialogComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    HomeComponentsModule,
    TranslateModule
  ],
  exports: [
    CustomAlarmsTableWidgetComponent,
    DisplayColumnsPanelComponent,
    AlarmFilterPanelComponent,
    AlarmDetailsDialogComponent
  ]
})
export class CustomAlarmsTableWidgetModule {
}
