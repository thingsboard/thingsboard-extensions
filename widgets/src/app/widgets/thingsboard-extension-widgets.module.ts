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
    ExampleModule
  ]
})
export class ThingsboardExtensionWidgetsModule {

  constructor(translate: TranslateService) {
    addCustomWidgetLocale(translate);
  }

}
