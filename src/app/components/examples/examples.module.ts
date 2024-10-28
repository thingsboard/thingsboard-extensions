import { NgModule } from '@angular/core';
import { ExampleTableComponent } from './example-table/example-table.component';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import {
  BasicWidgetConfigModule,
  HomeComponentsModule,
  WidgetConfigComponentsModule
} from '@home/components/public-api';
import { ChartModule } from 'primeng/chart';
import { AddEntityComponent } from './example-action/add-entity.component';
import {
  ExampleTableCustomSettingsComponent
} from './example-table-with-custom-settings/example-table-custom-settings.component';
import {
  ExampleTableAdvancedConfigComponent
} from './example-table-with-custom-settings/advanced-config/example-table-advanced-config.component';
import {
  ExampleTableBasicConfigComponent
} from './example-table-with-custom-settings/basic-config/example-table-basic-config.component';
import {
  DataKeySettingsComponent
} from './example-table-with-custom-settings/data-key-settings/data-key-settings.component';
import {
  ExampleTableCustomSubscriptionComponent
} from './example-table-with-custom-subscription/example-table-custom-subscription.component';
import {
  ExampleOfUsingThirdPartyLibraryComponent
} from './example-of-using-third-party-library/example-of-using-third-party-library.component';
import { FlexLayoutModule } from '@angular/flex-layout';

@NgModule({
  declarations: [
    ExampleTableComponent,
    AddEntityComponent,
    ExampleTableCustomSettingsComponent,
    ExampleTableAdvancedConfigComponent,
    ExampleTableBasicConfigComponent,
    DataKeySettingsComponent,
    ExampleTableCustomSubscriptionComponent,
    ExampleOfUsingThirdPartyLibraryComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    HomeComponentsModule,
    ChartModule,
    BasicWidgetConfigModule,
    WidgetConfigComponentsModule,
    FlexLayoutModule,
  ],
  exports: [
    ExampleTableComponent,
    AddEntityComponent,
    ExampleTableCustomSettingsComponent,
    ExampleTableAdvancedConfigComponent,
    ExampleTableBasicConfigComponent,
    DataKeySettingsComponent,
    ExampleTableCustomSubscriptionComponent,
    ExampleOfUsingThirdPartyLibraryComponent
  ]
})

export class ExamplesModule {
}
