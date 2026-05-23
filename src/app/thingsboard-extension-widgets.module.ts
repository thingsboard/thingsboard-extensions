///
/// Copyright © 2023 ThingsBoard, Inc.
///

import { NgModule } from "@angular/core";
import { TranslateService } from "@ngx-translate/core";
import addCustomWidgetLocale from "./locale/custom-widget-locale.constant";
import { CommonModule } from "@angular/common";
import { ExamplesModule } from "./components/examples/examples.module";
import { WaterMeteringModule } from "./water-metering/water-metering.module";
import { QcLabMonitoringModule } from "./qc-lab-monitoring/qc-lab-monitoring.module";
import { addLibraryStyles } from "./scss/lib-styles";
import { WidgetComponentsModule } from "@home/components/widget/widget-components.module";

@NgModule({
  declarations: [],
  imports: [CommonModule, WidgetComponentsModule, WaterMeteringModule, QcLabMonitoringModule],
  exports: [ExamplesModule, WaterMeteringModule, QcLabMonitoringModule, WidgetComponentsModule],
})
export class ThingsboardExtensionWidgetsModule {
  constructor(translate: TranslateService) {
    addCustomWidgetLocale(translate);
    addLibraryStyles("tb-extension-css");
  }
}
