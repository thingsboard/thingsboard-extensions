import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnInit,
  Renderer2,
  SecurityContext,
  TemplateRef,
  ViewChild
} from '@angular/core';
import * as echarts from 'echarts/core';
import { EChartsOption, SeriesOption } from 'echarts';
import { WidgetContext } from '@home/models/widget-component.models';
import { BarChart, CustomChart, LineChart, PieChart, RadarChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  PolarComponent,
  RadarComponent,
  TooltipComponent,
  VisualMapComponent
} from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer, SVGRenderer } from 'echarts/renderers';
import { LegendConfig, LegendData, LegendKey, ValueFormatProcessor, WidgetTimewindow } from '@shared/public-api';
import { CallbackDataParams, XAXisOption, YAXisOption } from 'echarts/types/dist/shared';
import { WidgetComponent } from '@home/components/widget/widget.component';
import { DomSanitizer } from '@angular/platform-browser';
import { isDefinedAndNotNull } from '@core/public-api';
import { calculateAxisSize, measureAxisNameSize } from '@home/components/public-api';
import { ECharts } from '@home/components/widget/lib/chart/echarts-widget.models';

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

  private valueFormatter: ValueFormatProcessor;

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
    this.prepareValueFormat();
    this.initEchart();
    this.initLegend();
  }

  ngAfterViewInit(): void {
    this.myChart = echarts.init(this.echartContainer.nativeElement,  null, {
      renderer: 'svg'
    });
    this.initResize();

    this.xAxis = this.setupXAxis();
    this.yAxis = this.setupYAxis();
    this.option = {
      ...this.setupAnimationSettings(),
      formatter: (params: CallbackDataParams[]) => this.setupTooltipElement(params),
      backgroundColor: "transparent",
      darkMode: false,
      tooltip: {
        show: true,
        trigger: 'axis',
        confine: true,
        padding: [8, 12],
        appendTo: 'body',
        textStyle: {
          fontFamily: 'Roboto',
          fontSize: 12,
          fontWeight: 'normal',
          lineHeight: 16
        }
      },
      grid: [{
        backgroundColor: null,
        borderColor: "#ccc",
        borderWidth: 1,
        bottom: 45,
        left: 5,
        right: 5,
        show: false,
        top: 10
      }],
      xAxis: [this.xAxis],
      yAxis: [this.yAxis],
      series: this.setupChartLines(),
      dataZoom: [
        {
          type: 'inside',
          disabled: false,
          realtime: true,
          filterMode:  'none'
        },
        {
          type: 'slider',
          show: true,
          showDetail: false,
          realtime: true,
          filterMode: 'none',
          bottom: 5
        }
      ]
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
            this.valueFormatter.format(value)
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

  private initEchart(): void {
    echarts.use([
      TooltipComponent,
      GridComponent,
      VisualMapComponent,
      DataZoomComponent,
      MarkLineComponent,
      PolarComponent,
      RadarComponent,
      LineChart,
      BarChart,
      PieChart,
      RadarChart,
      CustomChart,
      LabelLayout,
      CanvasRenderer,
      SVGRenderer
    ]);
  }

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

  private prepareValueFormat() {
    const units = this.ctx.units;
    this.valueFormatter = ValueFormatProcessor.fromSettings(this.ctx.$injector, {units, decimals: this.ctx.decimals});
  }

  private setupTooltipElement(params: CallbackDataParams[]): HTMLElement {
    const tooltipElement: HTMLElement = this.renderer.createElement('div');
    this.renderer.setStyle(tooltipElement, 'display', 'flex');
    this.renderer.setStyle(tooltipElement, 'flex-direction', 'column');
    this.renderer.setStyle(tooltipElement, 'align-items', 'flex-start');
    this.renderer.setStyle(tooltipElement, 'gap', '16px');
    if (params.length) {
      const tooltipItemsElement: HTMLElement = this.renderer.createElement('div');
      this.renderer.setStyle(tooltipItemsElement, 'display', 'flex');
      this.renderer.setStyle(tooltipItemsElement, 'flex-direction', 'column');
      this.renderer.setStyle(tooltipItemsElement, 'align-items', 'flex-start');
      this.renderer.setStyle(tooltipItemsElement, 'gap', '4px');

      this.renderer.appendChild(tooltipItemsElement, this.setTooltipDate(params));

      for (const [i, param] of params.entries()) {
        this.renderer.appendChild(tooltipItemsElement, this.constructTooltipSeriesElement(param, i));
      }

      this.renderer.appendChild(tooltipElement, tooltipItemsElement);
    }
    return tooltipElement;
  }

  private constructTooltipSeriesElement(param: CallbackDataParams, index: number): HTMLElement {
    const labelValueElement: HTMLElement = this.renderer.createElement('div');
    this.renderer.setStyle(labelValueElement, 'display', 'flex');
    this.renderer.setStyle(labelValueElement, 'flex-direction', 'row');
    this.renderer.setStyle(labelValueElement, 'align-items', 'center');
    this.renderer.setStyle(labelValueElement, 'align-self', 'stretch');
    this.renderer.setStyle(labelValueElement, 'gap', '12px');
    const labelElement: HTMLElement = this.renderer.createElement('div');
    this.renderer.setStyle(labelElement, 'display', 'flex');
    this.renderer.setStyle(labelElement, 'align-items', 'center');
    this.renderer.setStyle(labelElement, 'gap', '8px');
    this.renderer.appendChild(labelValueElement, labelElement);
    const circleElement: HTMLElement = this.renderer.createElement('div');
    this.renderer.setStyle(circleElement, 'width', '8px');
    this.renderer.setStyle(circleElement, 'height', '8px');
    this.renderer.setStyle(circleElement, 'border-radius', '50%');
    this.renderer.setStyle(circleElement, 'background', param.color);
    this.renderer.appendChild(labelElement, circleElement);
    const labelTextElement: HTMLElement = this.renderer.createElement('div');
    this.renderer.setProperty(labelTextElement, 'innerHTML', this.sanitizer.sanitize(SecurityContext.HTML, param.seriesName));
    this.renderer.setStyle(labelTextElement, 'font-family', 'Roboto');
    this.renderer.setStyle(labelTextElement, 'font-size', '12px');
    this.renderer.setStyle(labelTextElement, 'font-style', 'normal');
    this.renderer.setStyle(labelTextElement, 'font-weight', 400);
    this.renderer.setStyle(labelTextElement, 'line-height', '16px');
    this.renderer.setStyle(labelTextElement, 'color', 'rgba(0, 0, 0, 0.76)');
    this.renderer.appendChild(labelElement, labelTextElement);
    const decimals = isDefinedAndNotNull(this.ctx.data[index].dataKey.decimals) ?
      this.ctx.data[index].dataKey.decimals : this.ctx.decimals;
    const units = isDefinedAndNotNull(this.ctx.data[index].dataKey.units) ?
      this.ctx.data[index].dataKey.units : this.ctx.units;
    const valueFormatter = ValueFormatProcessor.fromSettings(this.ctx.$injector, {units, decimals});
    const value  = valueFormatter.format(param.value[1]);
    const valueElement: HTMLElement = this.renderer.createElement('div');
    this.renderer.setProperty(valueElement, 'innerHTML', this.sanitizer.sanitize(SecurityContext.HTML, value));
    this.renderer.setStyle(valueElement, 'flex', '1');
    this.renderer.setStyle(valueElement, 'text-align', 'end');
    this.renderer.setStyle(valueElement, 'font-family', 'Roboto');
    this.renderer.setStyle(valueElement, 'font-size', '12px');
    this.renderer.setStyle(valueElement, 'font-style', 'normal');
    this.renderer.setStyle(valueElement, 'font-weight', 500);
    this.renderer.setStyle(valueElement, 'line-height', '16px');
    this.renderer.setStyle(valueElement, 'color', 'rgba(0, 0, 0, 0.76)');
    this.renderer.appendChild(labelValueElement, valueElement);
    return labelValueElement;
  }

  private setTooltipDate(params: CallbackDataParams[]): HTMLElement {
    const dateElement: HTMLElement = this.renderer.createElement('div');
    this.renderer.appendChild(dateElement, this.renderer.createText(new Date(params[0].value[0]).toLocaleString('en-GB')));
    this.renderer.setStyle(dateElement, 'font-family', 'Roboto');
    this.renderer.setStyle(dateElement, 'font-size', '11px');
    this.renderer.setStyle(dateElement, 'font-style', 'normal');
    this.renderer.setStyle(dateElement, 'font-weight', '400');
    this.renderer.setStyle(dateElement, 'line-height', '16px');
    this.renderer.setStyle(dateElement, 'color', 'rgba(0, 0, 0, 0.76)');
    return dateElement
  }

  private setupAnimationSettings(): object {
      return  {
        animation: true,
        animationDelay: 0,
        animationDelayUpdate: 0,
        animationDuration: 500,
        animationDurationUpdate: 300,
        animationEasing: "cubicOut",
        animationEasingUpdate: "cubicOut",
        animationThreshold: 2000
      }
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

  private setupYAxis(): YAXisOption {
    return {
      type: 'value',
      position: 'left',
      mainType: 'yAxis',
      id: 'yAxis',
      offset: 0,
      name: 'YAxis',
      nameLocation: 'middle',
      nameRotate: 90,
      alignTicks: true,
      scale: true,
      show: true,
      axisLabel: {
        color: 'rgba(0, 0, 0, 0.54)',
        fontFamily: 'Roboto',
        fontSize: 12,
        fontStyle: 'normal',
        fontWeight: 400,
        show: true,
        formatter: (value: any) => {
          return this.valueFormatter.format(value);
        }
      },
      splitLine: {
        show: true,
      },
      axisLine: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.54)'
        }
      },
      axisTick: {
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.54)'
        },
        show: true
      },
      nameTextStyle: {
        color: 'rgba(0, 0, 0, 0.54)',
        fontFamily: 'Roboto',
        fontSize: 12,
        fontStyle: 'normal',
        fontWeight: 600
      }
    }
  }

  private setupXAxis(): XAXisOption {
    return {
      id: 'xAxis',
      mainType: 'xAxis',
      show: true,
      type: 'time',
      position: "bottom",
      name: 'XAxis',
      offset: 0,
      nameLocation: 'middle',
      max:  this.ctx.defaultSubscription.timeWindow.maxTime,
      min:  this.ctx.defaultSubscription.timeWindow.minTime,
      nameTextStyle: {
        color: 'rgba(0, 0, 0, 0.54)',
        fontStyle: 'normal',
        fontWeight: 600,
        fontFamily: 'Roboto',
        fontSize: 12,
      },
      axisPointer: {
        shadowStyle: {
          color: 'rgba(210,219,238,0.2)'
        }
      },
      splitLine: {
        show: true
      },
      axisTick: {
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.54)'
        }
      },
      axisLine: {
        onZero: false,
        show: true,
        lineStyle: {
          color: 'rgba(0, 0, 0, 0.54)'
        }
      },
      axisLabel: {
        color: 'rgba(0, 0, 0, 0.54)',
        fontFamily: 'Roboto',
        fontSize: 10,
        fontStyle: 'normal',
        fontWeight: 400,
        show: true,
        hideOverlap: true,
      }
    }
  }
}
