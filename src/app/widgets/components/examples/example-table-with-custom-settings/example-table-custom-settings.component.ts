import { Component, Input, OnInit } from '@angular/core';
import { WidgetContext } from '@home/models/widget-component.models';
import { ColorProcessor, ColorSettings, ComponentStyle, DataKey, Font, constantColor, iconStyle, textStyle } from '@shared/public-api';
import { formatValue, isDefinedAndNotNull } from '@core/public-api';

interface ExampleTableSettings {
   columnHeight: number,
   valueColor: ColorSettings,
   keyColor: ColorSettings,
   keyFont: Font,
   valueFont: Font
}

export const valueDefaultSettings: ExampleTableSettings = {
   columnHeight: 60,
   valueColor: constantColor('#212121'),
   keyColor: constantColor('#868686'),
   keyFont: {
      family: 'Roboto',
      size: 18,
      sizeUnit: 'px',
      style: 'normal',
      weight: '500',
      lineHeight: '100%'
   },
   valueFont: {
      family: 'Roboto',
      size: 30,
      sizeUnit: 'px',
      style: 'normal',
      weight: '500',
      lineHeight: '100%'
   }
}

enum FormatKey {
   DECIMALS = 'decimals',
   UNITS = 'units'
}

@Component({
   selector: 'tb-example-table-custom-settings',
   templateUrl: 'example-table-custom-settings.component.html',
   styleUrls: ['example-table-custom-settings.component.scss']
})

export class ExampleTableCustomSettingsComponent implements OnInit {

   @Input() ctx: WidgetContext;

   private settings: ExampleTableSettings;

   public tableValues: {[key: string]: any} = {};
   public entityName: string;
   public valueColor: ColorProcessor;
   public valueStyle: ComponentStyle = {};
   public keyColor: ColorProcessor;
   public keyStyle: ComponentStyle = {};
   public columnHeight: number;

   ngOnInit(): void {
      this.settings = this.ctx.settings;
      this.ctx.$scope.exampleTableComponent = this;
      this.entityName = this.ctx.datasources[0].entityName;
      this.columnHeight = this.settings.columnHeight ? this.settings.columnHeight : valueDefaultSettings.columnHeight;
      this.valueColor = ColorProcessor.fromSettings(this.settings.valueColor ? this.settings.valueColor : valueDefaultSettings.valueColor);
      this.keyColor = ColorProcessor.fromSettings(this.settings.keyColor ? this.settings.keyColor : valueDefaultSettings.keyColor);
      this.valueStyle = textStyle(this.settings.valueFont ? this.settings.valueFont : valueDefaultSettings.valueFont);
      this.keyStyle = textStyle(this.settings.keyFont ? this.settings.keyFont : valueDefaultSettings.keyFont);
   }

   public onDataUpdated(): void {
      for (const key of this.ctx.data) {
         if (key.data.length) {
            const rowName: string = key.dataKey.label;
            const rowValue: string = formatValue(
                key.data[0][1],
                this.getFormatInfo<number>(key.dataKey, FormatKey.DECIMALS),
                this.getFormatInfo<string>(key.dataKey, FormatKey.UNITS),
                false);
            this.tableValues[rowName] = {
               data: rowValue,
               icon: {
                  showIcon: key.dataKey.settings.showIcon,
                  iconStyles: iconStyle(key.dataKey.settings.iconSize, key.dataKey.settings.iconSizeUnit),
                  iconColor: ColorProcessor.fromSettings(key.dataKey.settings.iconColor),
                  icon: key.dataKey.settings.icon
               }
            };
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
