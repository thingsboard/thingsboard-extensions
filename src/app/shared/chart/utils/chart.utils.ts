///
/// Copyright © 2025 ThingsBoard, Inc.
///
// TODO: remove after 4.0 typing update
// @ts-ignore
import { XAXisOption, YAXisOption } from 'echarts/types/dist/shared';
// TODO: remove after 4.0 typing update
// @ts-ignore
import { EChartsModule, EChartsOption } from '@home/components/public-api';

export const extensionEchartsModule = new EChartsModule();

export const getDefaultXAxis = (min: number, max: number): XAXisOption => {
  return {
    id: 'xAxis',
    mainType: 'xAxis',
    show: true,
    type: 'time',
    position: "bottom",
    offset: 0,
    nameLocation: 'middle',
    max,
    min,
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

export const getDefaultYAxis = (formatter: (value: unknown) => string): YAXisOption => {
  return {
    type: 'value',
    position: 'left',
    mainType: 'yAxis',
    id: 'yAxis',
    offset: 0,
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
      formatter,
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

export const getDefaultChartOptions = (): Partial<EChartsOption> => {
  return {
    animation: true,
    animationDelay: 0,
    animationDelayUpdate: 0,
    animationDuration: 500,
    animationDurationUpdate: 300,
    animationEasing: "cubicOut",
    animationEasingUpdate: "cubicOut",
    animationThreshold: 2000,
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
}
