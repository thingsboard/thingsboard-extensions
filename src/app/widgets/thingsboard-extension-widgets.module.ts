///
/// Copyright © 2023 ThingsBoard, Inc.
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateService } from '@ngx-translate/core';
import addCustomWidgetLocale from './locale/custom-widget-locale.constant';
import { ExamplesModule } from './components/examples/public-api';
import { SharedModule } from '@shared/public-api';
import { HomeComponentsModule } from '@home/components/public-api';
import { ResourcesModule } from './components/resources/public-api';

@NgModule({
  declarations: [
  ],
  imports: [
    CommonModule,
    HomeComponentsModule,
    SharedModule
  ],
  exports: [
    ExamplesModule,
    ResourcesModule
  ]
})
export class ThingsboardExtensionWidgetsModule {

  constructor(translate: TranslateService) {
    addCustomWidgetLocale(translate);
  }

}
