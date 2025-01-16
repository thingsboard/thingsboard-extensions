///
/// Copyright © 2025 ThingsBoard, Inc.
///
import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnInit,
  Renderer2,
  TemplateRef,
  ViewChild
} from '@angular/core';
// TODO: remove after 4.0 typing update
// @ts-ignore
import * as echarts from 'echarts/core';
// TODO: remove after 4.0 typing update
// @ts-ignore
import { EChartsOption, SeriesOption } from 'echarts';
import { WidgetContext } from '@home/models/widget-component.models';
import { LegendConfig, LegendData, LegendKey, WidgetTimewindow } from '@shared/public-api';
// TODO: remove after 4.0 typing update
// @ts-ignore
import { CallbackDataParams, XAXisOption, YAXisOption } from 'echarts/types/dist/shared';
import { WidgetComponent } from '@home/components/widget/widget.component';
import { DomSanitizer } from '@angular/platform-browser';
import { formatValue, isDefinedAndNotNull } from '@core/public-api';
import { ECharts } from '@home/components/widget/lib/chart/echarts-widget.models';
// TODO: remove after 4.0 typing update
// @ts-ignore
import { calculateAxisSize, measureAxisNameSize, getValueElement, getLabelTextElement, getCircleElement, getLabelElement, getLabelValueElement, getTooltipElement, getTooltipDateElement } from '@home/components/public-api';
import {
  extensionEchartsModule,
  getDefaultChartOptions,
  getDefaultXAxis,
  getDefaultYAxis
} from '../../../shared/chart/public-api';

@Component({
  selector: 'tb-example-echart',
  templateUrl: './example-chart.component.html',
  styleUrls: ['./example-chart.component.scss']
})
export class ExampleChartComponent implements OnInit, AfterViewInit {

  @ViewChild('echartContainer', {static: false}) echartContainer: ElementRef<HTMLElement>;

  @Input() ctx: WidgetContext;

  @Input() widgetTitlePanel: TemplateRef<any>;

  private myChart: ECharts;
  private shapeResize$: ResizeObserver;
  private xAxis: XAXisOption;
  private yAxis: YAXisOption;
  private option: EChartsOption;

  public legendConfig: LegendConfig;
  public legendClass: string;
  public legendData: LegendData;
  public legendKeys: Array<LegendKey>;
  public showLegend: boolean;

  constructor(
    private renderer: Renderer2,
    private sanitizer: DomSanitizer,
    public widgetComponent: WidgetComponent,
  ) {}


  //Core logic
  ngOnInit(): void {
    this.ctx.$scope.echartExampleWidget = this;
    extensionEchartsModule.init();
    this.initLegend();
  }

  ngAfterViewInit(): void {
    this.myChart = echarts.init(this.echartContainer.nativeElement,  null, {
      renderer: 'svg'
    });
    this.initResize();

    this.xAxis = getDefaultXAxis(this.ctx.defaultSubscription.timeWindow.maxTime, this.ctx.defaultSubscription.timeWindow.minTime);
    this.yAxis = getDefaultYAxis(value => formatValue(value, this.ctx.decimals,  this.ctx.units, false));
    this.option = {
      ...getDefaultChartOptions(),
      formatter: (params: CallbackDataParams[]) => this.setupTooltipElement(params),
      xAxis: [this.xAxis],
      yAxis: [this.yAxis],
      series: this.setupChartLines(),
    }

    this.myChart.setOption(this.option);
    this.updateAxisOffset(false);
  }

  public onDataUpdated() {
    const newData = [];
    this.onResize();
    this.updateXAxisTimeWindow(this.xAxis, this.ctx.defaultSubscription.timeWindow);
    for(const key in this.ctx.data) {
      newData[key] = [];
      for(const [ts, value] of this.ctx.data[key].data) {
        newData[key].push({
          name: ts,
          value: [
            ts,
            value
          ]
        })
      }
    }

    const linesData = [];
    for(const data of newData) {
      linesData.push({data});
    }
    this.option.series = linesData;

    this.myChart.setOption(this.option);
    this.updateAxisOffset()
  }

  //Support logic
  private updateAxisOffset(lazy = true): void {
    const leftOffset = calculateAxisSize(this.myChart, this.yAxis.mainType,  this.yAxis.id as string);
    const leftNameSize = measureAxisNameSize(this.myChart, this.yAxis.mainType, this.yAxis.id as string, this.yAxis.name);
    const bottomOffset = calculateAxisSize(this.myChart, this.xAxis.mainType,  this.xAxis.id as string);
    const bottomNameSize = measureAxisNameSize(this.myChart, this.yAxis.mainType, this.yAxis.id as string, this.yAxis.name);
    const newGridLeft = leftOffset + leftNameSize;
    const newGridBottom = bottomOffset + bottomNameSize + 35;
    if (this.option.grid[0].left !== newGridLeft || this.option.grid[0].bottom !== newGridBottom) {
      this.option.grid[0].left = newGridLeft;
      this.yAxis.nameGap = leftOffset;
      this.option.grid[0].bottom = newGridBottom;
      this.xAxis.nameGap = bottomOffset;
      this.myChart.setOption(this.option, {replaceMerge: ['yAxis', 'xAxis', 'grid'], lazyUpdate: lazy});
    }
  }

  private updateXAxisTimeWindow = (option: XAXisOption,
                                   timeWindow: WidgetTimewindow) => {
    option.min = timeWindow.minTime;
    option.max = timeWindow.maxTime;
  };

  private initLegend(): void {
    this.showLegend = this.ctx.settings.showLegend;
    if (this.showLegend) {
      this.legendConfig = this.ctx.settings.legendConfig;
      this.legendData = this.ctx.defaultSubscription.legendData;
      this.legendKeys = this.legendData.keys;
      this.legendClass = `legend-${this.legendConfig.position}`;
      if (this.legendConfig.sortDataKeys) {
        this.legendKeys = this.legendData.keys.sort((key1, key2) => key1.dataKey.label.localeCompare(key2.dataKey.label));
      } else {
        this.legendKeys = this.legendData.keys;
      }
    }
  }

  private initResize(): void {
    this.shapeResize$ = new ResizeObserver(() => {
      this.onResize();
    });
    this.shapeResize$.observe(this.echartContainer.nativeElement);
  }

  private onResize() {
    this.myChart.resize();
  }

  private setupTooltipElement(params: CallbackDataParams[]): HTMLElement {
    const tooltipElement: HTMLElement = getTooltipElement(this.renderer, '16px');
    if (params.length) {
      const tooltipItemsElement: HTMLElement = getTooltipElement(this.renderer, '4px');

      this.renderer.appendChild(tooltipItemsElement, getTooltipDateElement(this.renderer, new Date(params[0].value[0]).toLocaleString('en-GB')));

      for (const [i, param] of params.entries()) {
        this.renderer.appendChild(tooltipItemsElement, this.constructTooltipSeriesElement(param, i));
      }

      this.renderer.appendChild(tooltipElement, tooltipItemsElement);
    }
    return tooltipElement;
  }

  private constructTooltipSeriesElement(param: CallbackDataParams, index: number): HTMLElement {
    const labelValueElement: HTMLElement = getLabelValueElement(this.renderer);
    const labelElement: HTMLElement = getLabelElement(this.renderer);
    const circleElement: HTMLElement = getCircleElement(this.renderer, param.color);
    this.renderer.appendChild(labelElement, circleElement);
    const labelTextElement: HTMLElement = getLabelTextElement(this.renderer, this.sanitizer, param.seriesName);
    this.renderer.appendChild(labelElement, labelTextElement);
    const decimals = isDefinedAndNotNull(this.ctx.data[index].dataKey.decimals) ?
      this.ctx.data[index].dataKey.decimals : this.ctx.decimals;
    const units = isDefinedAndNotNull(this.ctx.data[index].dataKey.units) ?
      this.ctx.data[index].dataKey.units : this.ctx.units;
    const value  = formatValue(param.value[1], decimals, units, false);
    const valueElement: HTMLElement = getValueElement(this.renderer, this.sanitizer, value);
    this.renderer.appendChild(labelValueElement, valueElement);
    return labelValueElement;
  }

  private setupChartLines(): SeriesOption[] {
    const series: SeriesOption[] = [];
    for(const [index, dataKey] of this.ctx.datasources[0].dataKeys.entries()) {
      series.push({
        id: index,
        name: dataKey.label,
        type: 'line',
        showSymbol: false,
        smooth: false,
        step: false,
        stackStrategy: 'all',
        data: [],
        lineStyle: {
          color: dataKey.color
        },
        itemStyle: {
          color: dataKey.color
        }
      })
    }
    return series;
  }
}
