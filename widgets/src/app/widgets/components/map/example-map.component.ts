///
/// Copyright © 2020 ThingsBoard
///

import { Component, Input, OnInit } from '@angular/core';
import { MapWidgetInterface } from './map-widget.interface';
import { defaultSettings, hereProviders, MapProviders, UnitedMapSettings } from './map-models';
import { Datasource, DatasourceData, JsonSettingsSchema, WidgetActionDescriptor } from '@shared/public-api';
import { deepClone } from '@core/public-api';
import {
  commonMapSettingsSchema,
  mapPolygonSchema,
  mapProviderSchema,
  markerClusteringSettingsSchema, markerClusteringSettingsSchemaLeaflet,
  routeMapSettingsSchema
} from './schemes';
import { addCondition, addGroupInfo, addToSchema, initSchema, mergeSchemes } from '../../utils/schema-utils';
import { providerSets } from './providers';
import { UtilsService } from '@core/public-api';
import { TranslateService } from '@ngx-translate/core';
import { getDefCenterPosition, parseFunction, parseWithTranslation } from './maps-utils';

@Component({
  selector: 'tb-example-map',
  template: ''
})
export class ExampleMap implements MapWidgetInterface, OnInit {

  @Input() ctx: any;

  @Input() mapProvider: MapProviders

  public $element: any;
  constructor() {}

  map: any;
  provider: MapProviders;
  schema: JsonSettingsSchema;
  data: DatasourceData[];
  settings: UnitedMapSettings;
  pageLink: any;

  public static dataKeySettingsSchema(): object {
    return {};
  }

  public static getProvidersSchema(mapProvider: MapProviders, ignoreImageMap = false) {
    const providerSchema = deepClone(mapProviderSchema);
    if (mapProvider) {
      providerSchema.schema.properties.provider.default = mapProvider;
    }
    if (ignoreImageMap) {
      providerSchema.form[0].items = providerSchema.form[0]?.items.filter(item => item.value !== 'image-map');
    }
    return mergeSchemes([providerSchema,
      ...Object.keys(providerSets)?.map(
        (key: string) => {
          const setting = providerSets[key];
          return addCondition(setting?.schema, `model.provider === '${setting.name}'`);
        })]);
  }

  public static settingsSchema(mapProvider: MapProviders, drawRoutes: boolean): JsonSettingsSchema {
    const schema = initSchema();
    addToSchema(schema, this.getProvidersSchema(mapProvider));
    addGroupInfo(schema, 'Map Provider Settings');
    addToSchema(schema, commonMapSettingsSchema);
    addGroupInfo(schema, 'Common Map Settings');
    addToSchema(schema, addCondition(mapPolygonSchema, 'model.showPolygon === true', ['showPolygon']));
    addGroupInfo(schema, 'Polygon Settings');
    if (drawRoutes) {
      addToSchema(schema, routeMapSettingsSchema);
      addGroupInfo(schema, 'Route Map Settings');
    } else {
      const clusteringSchema = mergeSchemes([markerClusteringSettingsSchema,
        addCondition(markerClusteringSettingsSchemaLeaflet,
          `model.useClusterMarkers === true && model.provider !== "image-map"`)]);
      addToSchema(schema, clusteringSchema);
      addGroupInfo(schema, 'Markers Clustering Settings');
    }
    return schema;
  }

  translate = (key: string, defaultTranslation?: string): string => {
    if (key) {
      return (this.ctx.$injector.get(UtilsService).customTranslation(key, defaultTranslation || key)
        || this.ctx.$injector.get(TranslateService).instant(key));
    }
    return '';
  }

  getDescriptors(name: string): { [name: string]: ($event: Event, datasource: Datasource) => void } {
    const descriptors = this.ctx.actionsApi.getActionDescriptors(name);
    const actions = {};
    descriptors.forEach(descriptor => {
      actions[descriptor.name] = ($event: Event, datasource: Datasource) => this.onCustomAction(descriptor, $event, datasource);
    }, actions);
    return actions;
  }

  ngOnInit() {
    this.ctx.onResize = this.onResize;

    if (this.map) {
      this.map.map.remove();
      delete this.map;
    }

    this.data = this.ctx.data;
    this.$element = this.ctx.$containerParent[0];
    this.settings = this.initSettings(this.ctx.settings, false);
    this.settings.tooltipAction = this.getDescriptors('tooltipAction');
    this.settings.markerClick = this.getDescriptors('markerClick');
    this.settings.polygonClick = this.getDescriptors('polygonClick');

    const MapClass = providerSets[this.provider]?.MapClass;
    if (!MapClass) {
      return;
    }
    parseWithTranslation.setTranslate(this.translate);
    this.map = new MapClass(this.ctx, this.$element, this.settings);
    (this.ctx as any).mapInstance = this.map;
    this.pageLink = {
      page: 0,
      pageSize: this.settings.mapPageSize,
      textSearch: null,
      dynamic: true
    };
    this.map.setLoading(true);
    this.ctx.defaultSubscription.subscribeAllForPaginatedData(this.pageLink, null);
    const subscription = this.ctx.defaultSubscription;
    subscription.callbacks.onDataUpdated = () => {
      this.update()
    }
  }

  private onCustomAction(descriptor: WidgetActionDescriptor, $event: Event, entityInfo: Datasource) {
    if ($event) {
      $event.preventDefault();
      $event.stopPropagation();
    }
    const { entityId, entityName, entityLabel, entityType } = entityInfo;
    this.ctx.actionsApi.handleWidgetAction($event, descriptor, {
      entityType,
      id: entityId
    }, entityName, null, entityLabel);
  }

  initSettings(settings: UnitedMapSettings, isEditMap?: boolean): UnitedMapSettings {
    const functionParams = ['data', 'dsData', 'dsIndex'];
    this.provider = settings.provider || this.mapProvider;
    if (this.provider === MapProviders.here && !settings.mapProviderHere) {
      if (settings.mapProvider && hereProviders.includes(settings.mapProvider)) {
        settings.mapProviderHere = settings.mapProvider;
      } else {
        settings.mapProviderHere = hereProviders[0];
      }
    }
    const customOptions = {
      provider: this.provider,
      mapUrl: settings?.mapImageUrl,
      labelFunction: parseFunction(settings.labelFunction, functionParams),
      tooltipFunction: parseFunction(settings.tooltipFunction, functionParams),
      colorFunction: parseFunction(settings.colorFunction, functionParams),
      polygonColorFunction: parseFunction(settings.polygonColorFunction, functionParams),
      polygonTooltipFunction: parseFunction(settings.polygonTooltipFunction, functionParams),
      markerImageFunction: parseFunction(settings.markerImageFunction, ['data', 'images', 'dsData', 'dsIndex']),
      labelColor: this.ctx.widgetConfig.color,
      polygonKeyName: settings.polKeyName ? settings.polKeyName : settings.polygonKeyName,
      tooltipPattern: settings.tooltipPattern ||
        '<b>${entityName}</b><br/><br/><b>Latitude:</b> ${' +
        settings.latKeyName + ':7}<br/><b>Longitude:</b> ${' + settings.lngKeyName + ':7}',
      defaultCenterPosition: getDefCenterPosition(settings?.defaultCenterPosition),
      currentImage: (settings.markerImage?.length) ? {
        url: settings.markerImage,
        size: settings.markerImageSize || 34
      } : null
    };
    if (isEditMap && !settings.hasOwnProperty('draggableMarker')) {
      settings.draggableMarker = true;
    }
    if (isEditMap && !settings.hasOwnProperty('editablePolygon')) {
      settings.editablePolygon = true;
    }
    return { ...defaultSettings, ...settings, ...customOptions, };
  }

  update() {
    this.map.updateData(false, this.settings.showPolygon);
    this.map.setLoading(false);
  }

  public onResize() {
    this.map?.invalidateSize();
    this.map?.onResize();
  }

  onDestroy() {
  }

}
