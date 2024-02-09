import { Component, Input, OnInit } from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';
import { formatValue, isDefinedAndNotNull } from '@core/public-api';
import { DataKey } from '@shared/public-api';

enum FormatKey {
   DECIMALS = 'decimals',
   UNITS = 'units'
}

@Component({
   selector: 'tb-example-table',
   templateUrl: 'example-table.component.html',
   styleUrls: ['example-table.component.scss']
})

export class ExampleTableComponent implements OnInit {

   @Input() ctx: WidgetContext;

   public tableValues: {[key: string]: any} = {};
   public entityName: string;

   ngOnInit(): void {
      this.ctx.$scope.exampleTableComponent = this;
      this.entityName = this.ctx.datasources[0].entityName;
   }

   public onDataUpdated(): void {
      for (const key of this.ctx.data) {
         if (key.data.length) {
            const rowName: string =  key.dataKey.label;
            const rowValue: string = formatValue(
                key.data[0][1],
                this.getFormatInfo<number>(key.dataKey, FormatKey.DECIMALS),
                this.getFormatInfo<string>(key.dataKey, FormatKey.UNITS),
                false);
            this.tableValues[rowName] = rowValue;
         }
      }
      this.ctx.detectChanges();
   }

   private getFormatInfo<T>(dataKey: DataKey, formatKey: FormatKey): T {
      let formatInfo = this.ctx[formatKey] as T;
      if (isDefinedAndNotNull(dataKey[formatKey])) {
         formatInfo = dataKey[formatKey] as T;
      }

      return formatInfo;
   }
}
