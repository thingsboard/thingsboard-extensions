///
/// Copyright © 2020 ThingsBoard
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import addCustomWidgetLocale from './locale/custom-widget-locale.constant';
import { ExampleModule } from './components/example/example.module';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { ExampleMap } from './components/map/example-map.component';
import { CustomAlarmsTableWidgetModule } from "./components/alarm/custom-alarms-table-widget.module";

@NgModule({
  declarations: [
    ExampleMap
  ],
  imports: [
    CommonModule,
    HomeComponentsModule,
    SharedModule
  ],
  exports: [
    ExampleMap,
    ExampleModule,
    CustomAlarmsTableWidgetModule
  ]
})
export class ThingsboardExtensionWidgetsModule {

  constructor(translate: TranslateService) {
    addCustomWidgetLocale(translate);
  }

}
