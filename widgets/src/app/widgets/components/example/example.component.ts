///
/// Copyright © 2022 ThingsBoard, Inc.
///

import { Component, OnInit, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'tb-example',
  templateUrl: './example.component.html',
  styleUrls: [
    './example.component.scss',
    '../../../../../node_modules/primeicons/primeicons.css',
    '../../../../../node_modules/primeng/resources/themes/nova/theme.css',
    '../../../../../node_modules/primeng/resources/primeng.min.css'
  ],
  encapsulation: ViewEncapsulation.None
})
export class ExampleComponent implements OnInit {

  constructor() { }

  ngOnInit() {
  }

}
