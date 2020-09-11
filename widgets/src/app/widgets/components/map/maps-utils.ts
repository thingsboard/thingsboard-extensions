///
/// Copyright © 2020 ThingsBoard
///

import { DatasourceData } from '@shared/public-api';
import { FormattedData, MarkerSettings, PolygonSettings, PolylineSettings, ReplaceInfo } from './map-models';
import { Observable, Observer, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { createLabelFromDatasource, hashCode, isDefinedAndNotNull, isNumber, padValue } from '@core/public-api';

const L = (window as any).L;
const _  = (window as any)._;
export type TranslateFunc = (key: string, defaultTranslation?: string) => string;

const varsRegex = /\${([^}]*)}/g;
const linkActionRegex = /<link-act name=['"]([^['"]*)['"]>([^<]*)<\/link-act>/g;
const buttonActionRegex = /<button-act name=['"]([^['"]*)['"]>([^<]*)<\/button-act>/g;

function createLinkElement(actionName: string, actionText: string): string {
  return `<a href="javascript:void(0);" class="tb-custom-action" data-action-name=${actionName}>${actionText}</a>`;
}

function createButtonElement(actionName: string, actionText: string) {
  return `<button mat-button class="tb-custom-action" data-action-name=${actionName}>${actionText}</button>`;
}

function parseTemplate(template: string, data: { $datasource?: any, [key: string]: any },
                       translateFn?: TranslateFunc) {
  let res = '';
  try {
    if (translateFn) {
      template = translateFn(template);
    }
    template = createLabelFromDatasource(data.$datasource, template);

    let match = /\${([^}]*)}/g.exec(template);
    while (match !== null) {
      const variable = match[0];
      let label = match[1];
      let valDec = 2;
      const splitValues = label.split(':');
      if (splitValues.length > 1) {
        label = splitValues[0];
        valDec = parseFloat(splitValues[1]);
      }

      if (label.startsWith('#')) {
        const keyIndexStr = label.substring(1);
        const n = Math.floor(Number(keyIndexStr));
        if (String(n) === keyIndexStr && n >= 0) {
          label = data.$datasource.dataKeys[n].label;
        }
      }

      const value = data[label] || '';
      let textValue: string;
      if (isNumber(value)) {
        textValue = padValue(value, valDec);
      } else {
        textValue = value;
      }
      template = template.replace(variable, textValue);
      match = /\${([^}]*)}/g.exec(template);
    }

    let actionTags: string;
    let actionText: string;
    let actionName: string;
    let action: string;

    match = linkActionRegex.exec(template);
    while (match !== null) {
      [actionTags, actionName, actionText] = match;
      action = createLinkElement(actionName, actionText);
      template = template.replace(actionTags, action);
      match = linkActionRegex.exec(template);
    }

    match = buttonActionRegex.exec(template);
    while (match !== null) {
      [actionTags, actionName, actionText] = match;
      action = createButtonElement(actionName, actionText);
      template = template.replace(actionTags, action);
      match = buttonActionRegex.exec(template);
    }

    // const compiled = _.template(template);
    // res = compiled(data);
    res = template;
  } catch (ex) {
    console.log(ex, template);
  }
  return res;
}

export function createTooltip(target: any,
                              settings: MarkerSettings | PolylineSettings | PolygonSettings,
                              datasource: any,
                              content?: string | HTMLElement
) {
  const popup = L.popup();
  popup.setContent(content);
  target.bindPopup(popup, { autoClose: settings.autocloseTooltip, closeOnClick: false });
  if (settings.showTooltipAction === 'hover') {
    target.off('click');
    target.on('mouseover', () => {
      target.openPopup();
    });
    target.on('mouseout', () => {
      target.closePopup();
    });
  }
  target.on('popupopen', () => {
    bindPopupActions(popup, settings, datasource);
  });
  return popup;
}

export function bindPopupActions(popup: any, settings: MarkerSettings | PolylineSettings | PolygonSettings,
                                 datasource: any) {
  const actions = popup.getElement().getElementsByClassName('tb-custom-action');
  Array.from(actions).forEach(
    (element: HTMLElement) => {
      const actionName = element.getAttribute('data-action-name');
      if (element && settings.tooltipAction[actionName]) {
        element.onclick = ($event) =>
        {
          settings.tooltipAction[actionName]($event, datasource);
          return false;
        };
      }
    });
}

export function createLoadingDiv(loadingText: string): JQuery<HTMLElement> {
  return $(`
    <div style="
          z-index: 12;
          position: absolute;
          top: 0;
          bottom: 0;
          left: 0;
          right: 0;
          flex-direction: column;
          align-content: center;
          align-items: center;
          justify-content: center;
          display: flex;
          background: rgba(255,255,255,0.7);
          font-size: 16px;
          font-family: Roboto;
          font-weight: 400;
          text-transform:  uppercase;
        ">
        <span>${loadingText}</span>
    </div>
  `);
}

const imageAspectMap = {};

function imageLoader(imageUrl: string): Observable<HTMLImageElement> {
  return new Observable((observer: Observer<HTMLImageElement>) => {
    const image = document.createElement('img'); // support IE
    image.style.position = 'absolute';
    image.style.left = '-99999px';
    image.style.top = '-99999px';
    image.onload = () => {
      observer.next(image);
      document.body.removeChild(image);
      observer.complete();
    };
    image.onerror = err => {
      observer.error(err);
      document.body.removeChild(image);
      observer.complete();
    };
    document.body.appendChild(image);
    image.src = imageUrl;
  });
}

export function aspectCache(imageUrl: string): Observable<number> {
  if (imageUrl?.length) {
    const hash = hashCode(imageUrl);
    let aspect = imageAspectMap[hash];
    if (aspect) {
      return of(aspect);
    }
    return imageLoader(imageUrl).pipe(map(image => {
      aspect = image.width / image.height;
      imageAspectMap[hash] = aspect;
      return aspect;
    }));
  }
}

export function parseFunction(source: any, params: string[] = ['def']): (...args: any[]) => any {
  let res = null;
  if (source?.length) {
    try {
      res = new Function(...params, source);
    }
    catch (err) {
      res = null;
    }
  }
  return res;
}

export function getDefCenterPosition(position) {
  if (typeof (position) === 'string') {
    return position.split(',');
  }
  if (typeof (position) === 'object') {
    return position;
  }
  return [0, 0];
}

export function parseData(input: DatasourceData[]): FormattedData[] {
  return _(input).groupBy(el => el?.datasource?.entityName)
    .values().value().map((entityArray, i) => {
      const obj: FormattedData = {
        entityName: entityArray[0]?.datasource?.entityName,
        entityId: entityArray[0]?.datasource?.entityId,
        entityType: entityArray[0]?.datasource?.entityType,
        $datasource: entityArray[0]?.datasource,
        dsIndex: i,
        deviceType: null
      };
      entityArray.filter(el => el.data.length).forEach(el => {
        const indexDate = el?.data?.length ? el.data.length - 1 : 0;
        obj[el?.dataKey?.label] = el?.data[indexDate][1];
        obj[el?.dataKey?.label + '|ts'] = el?.data[indexDate][0];
        if (el?.dataKey?.label === 'type') {
          obj.deviceType = el?.data[indexDate][1];
        }
      });
      return obj;
    });
}

export function processPattern(template: string, data: { $datasource?: any, [key: string]: any }): Array<ReplaceInfo> {
  const replaceInfo = [];
  try {
    const reg = /\${([^}]*)}/g;
    let match = reg.exec(template);
    while (match !== null) {
      const variableInfo: ReplaceInfo = {
        dataKeyName: '',
        valDec: 2,
        variable: ''
      };
      const variable = match[0];
      let label = match[1];
      let valDec = 2;
      const splitValues = label.split(':');
      if (splitValues.length > 1) {
        label = splitValues[0];
        valDec = parseFloat(splitValues[1]);
      }

      variableInfo.variable = variable;
      variableInfo.valDec = valDec;

      if (label.startsWith('#')) {
        const keyIndexStr = label.substring(1);
        const n = Math.floor(Number(keyIndexStr));
        if (String(n) === keyIndexStr && n >= 0) {
          variableInfo.dataKeyName = data.$datasource.dataKeys[n].label;
        }
      } else {
        variableInfo.dataKeyName = label;
      }
      replaceInfo.push(variableInfo);

      match = reg.exec(template);
    }
  } catch (ex) {
    console.log(ex, template);
  }
  return replaceInfo;
}

export function fillPattern(markerLabelText: string, replaceInfoLabelMarker: Array<ReplaceInfo>, data: FormattedData) {
  let text = createLabelFromDatasource(data.$datasource, markerLabelText);
  if (replaceInfoLabelMarker) {
    for (const variableInfo of replaceInfoLabelMarker) {
      let txtVal = '';
      if (variableInfo.dataKeyName && isDefinedAndNotNull(data[variableInfo.dataKeyName])) {
        const varData = data[variableInfo.dataKeyName];
        if (isNumber(varData)) {
          txtVal = padValue(varData, variableInfo.valDec);
        } else {
          txtVal = varData;
        }
      }
      text = text.replace(variableInfo.variable, txtVal);
    }
  }
  return text;
}

export function safeExecute(func: (...args: any[]) => any, params = []) {
  let res = null;
  if (func && typeof (func) === 'function') {
    try {
      res = func(...params);
    }
    catch (err) {
      console.log('error in external function:', err);
      res = null;
    }
  }
  return res;
}

function prepareProcessPattern(template: string, translateFn?: TranslateFunc): string {
  if (translateFn) {
    template = translateFn(template);
  }
  let actionTags: string;
  let actionText: string;
  let actionName: string;
  let action: string;

  let match = linkActionRegex.exec(template);
  while (match !== null) {
    [actionTags, actionName, actionText] = match;
    action = createLinkElement(actionName, actionText);
    template = template.replace(actionTags, action);
    match = linkActionRegex.exec(template);
  }

  match = buttonActionRegex.exec(template);
  while (match !== null) {
    [actionTags, actionName, actionText] = match;
    action = createButtonElement(actionName, actionText);
    template = template.replace(actionTags, action);
    match = buttonActionRegex.exec(template);
  }
  return template;
}

export const parseWithTranslation = {

  translateFn: null,

  translate(key: string, defaultTranslation?: string): string {
    if (this.translateFn) {
      return this.translateFn(key, defaultTranslation);
    } else {
      throw console.error('Translate not assigned');
    }
  },
  parseTemplate(template: string, data: object, forceTranslate = false): string {
    return parseTemplate(forceTranslate ? this.translate(template) : template, data, this.translate.bind(this));
  },
  prepareProcessPattern(template: string, forceTranslate = false): string {
    return prepareProcessPattern(forceTranslate ? this.translate(template) : template, this.translate.bind(this));
  },
  setTranslate(translateFn: TranslateFunc) {
    this.translateFn = translateFn;
  }
};

