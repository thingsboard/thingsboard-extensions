///
/// Copyright © 2022 ThingsBoard, Inc.
///

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedModule } from '@shared/public-api';
import { ExampleComponent } from './example.component';
import { ButtonModule } from 'primeng/button';
import { AccordionModule } from 'primeng/accordion';

@NgModule({
  declarations: [
    ExampleComponent
  ],
  imports: [
    CommonModule,
    SharedModule,
    ButtonModule,
    AccordionModule
  ],
  exports: [
    ExampleComponent
  ]
})
export class ExampleModule {
}
