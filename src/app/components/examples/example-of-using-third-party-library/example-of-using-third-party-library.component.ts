///
/// Copyright © 2023 ThingsBoard, Inc.
///

import { Component, Input, OnInit, ViewEncapsulation } from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';

@Component({
  selector: 'tb-example-of-using-third-party-library',
  templateUrl: './example-of-using-third-party-library.component.html',
  styleUrls: [

  ],
  encapsulation: ViewEncapsulation.None
})

export class ExampleOfUsingThirdPartyLibraryComponent implements OnInit {

  @Input() ctx: WidgetContext;

  public options: any;
  public data: any;

  ngOnInit(): void {
    this.ctx.$scope.exampleTableComponent = this;
    this.options = {
      animation: false,
      plugins: {
        legend: {
          labels: {
            usePointStyle: true
          }
        }
      }
    };
  }

  public onDataUpdated(): void {
    const data: any = {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: []
      }]
    };

    for (const key of this.ctx.data) {
      if (key.data.length) {
        data.labels.push(key.dataKey.label);
        data.datasets[0].data.push(key.data[0][1]);
        data.datasets[0].backgroundColor.push(key.dataKey.color);
      }
    }

    this.data = data;
    this.ctx.detectChanges();
  }
}
