///
/// Copyright © 2023 ThingsBoard, Inc.
///

import { LatLngTuple } from 'leaflet';
import { Datasource, EntityType } from '@shared/public-api';

export const tinycolor =  (window as any).tinycolor ;

export const DEFAULT_MAP_PAGE_SIZE = 16384;

export type GenericFunction = (data: FormattedData, dsData: FormattedData[], dsIndex: number) => string;
export type MarkerImageFunction = (data: FormattedData, dsData: FormattedData[], dsIndex: number) => string;
export type PosFuncton = (origXPos, origYPos) => { x, y };

export type MapSettings = {
    draggableMarker: boolean;
    editablePolygon: boolean;
    posFunction: PosFuncton;
    defaultZoomLevel?: number;
    disableScrollZooming?: boolean;
    minZoomLevel?: number;
    useClusterMarkers: boolean;
    latKeyName?: string;
    lngKeyName?: string;
    xPosKeyName?: string;
    yPosKeyName?: string;
    imageEntityAlias: string;
    imageUrlAttribute: string;
    mapProvider: MapProviders;
    mapProviderHere: string;
    mapUrl?: string;
    mapImageUrl?: string;
    provider?: MapProviders;
    credentials?: any; // declare credentials format
    gmApiKey?: string;
    defaultCenterPosition?: LatLngTuple;
    markerClusteringSetting?;
    useDefaultCenterPosition?: boolean;
    gmDefaultMapType?: string;
    useLabelFunction: boolean;
    icon?: any;
    zoomOnClick: boolean,
    maxZoom: number,
    showCoverageOnHover: boolean,
    animate: boolean,
    maxClusterRadius: number,
    chunkedLoading: boolean,
    removeOutsideVisibleBounds: boolean,
    useCustomProvider: boolean,
    customProviderTileUrl: string;
    mapPageSize: number;
};

export enum MapProviders {
    google = 'google-map',
    openstreet = 'openstreet-map',
    here = 'here',
    image = 'image-map',
    tencent = 'tencent-map'
}

export type MarkerSettings = {
    tooltipPattern?: any;
    tooltipAction: { [name: string]: actionsHandler };
    icon?: any;
    showLabel?: boolean;
    label: string;
    labelColor: string;
    labelText: string;
    useLabelFunction: boolean;
    draggableMarker: boolean;
    showTooltip?: boolean;
    useTooltipFunction: boolean;
    useColorFunction: boolean;
    color?: string;
    tinyColor?: tinycolor.Instance;
    autocloseTooltip: boolean;
    showTooltipAction: string;
    useClusterMarkers: boolean;
    currentImage?: string;
    useMarkerImageFunction?: boolean;
    markerImages?: string[];
    markerImageSize: number;
    fitMapBounds: boolean;
    markerImage: string;
    markerClick: { [name: string]: actionsHandler };
    colorFunction: GenericFunction;
    tooltipFunction: GenericFunction;
    labelFunction: GenericFunction;
    markerImageFunction?: MarkerImageFunction;
    markerOffsetX: number;
    markerOffsetY: number;
};

export interface FormattedData {
    $datasource: Datasource;
    entityName: string;
    entityId: string;
    entityType: EntityType;
    dsIndex: number;
    deviceType: string;
    [key: string]: any;
}

export interface ReplaceInfo {
  variable: string;
  valDec?: number;
  dataKeyName: string;
}

export type PolygonSettings = {
    showPolygon: boolean;
    polygonKeyName: string;
    polKeyName: string; // deprecated
    polygonStrokeOpacity: number;
    polygonOpacity: number;
    polygonStrokeWeight: number;
    polygonStrokeColor: string;
    polygonColor: string;
    showPolygonTooltip: boolean;
    autocloseTooltip: boolean;
    showTooltipAction: string;
    tooltipAction: { [name: string]: actionsHandler };
    polygonTooltipPattern: string;
    usePolygonTooltipFunction: boolean;
    polygonClick: { [name: string]: actionsHandler };
    usePolygonColorFunction: boolean;
    polygonTooltipFunction: GenericFunction;
    polygonColorFunction?: GenericFunction;
    editablePolygon: boolean;
};

export type PolylineSettings = {
    usePolylineDecorator: any;
    autocloseTooltip: boolean;
    showTooltipAction: string;
    useColorFunction: any;
    tooltipAction: { [name: string]: actionsHandler };
    color: string;
    useStrokeOpacityFunction: any;
    strokeOpacity: number;
    useStrokeWeightFunction: any;
    strokeWeight: number;
    decoratorOffset: string | number;
    endDecoratorOffset: string | number;
    decoratorRepeat: string | number;
    decoratorSymbol: any;
    decoratorSymbolSize: any;
    useDecoratorCustomColor: any;
    decoratorCustomColor: any;


    colorFunction: GenericFunction;
    strokeOpacityFunction: GenericFunction;
    strokeWeightFunction: GenericFunction;
};

export interface HistorySelectSettings {
    buttonColor: string;
}

export interface MapImage {
    imageUrl: string;
    aspect: number;
    update?: boolean;
}

export type TripAnimationSettings = {
    showPoints: boolean;
    pointColor: string;
    pointSize: number;
    pointTooltipOnRightPanel: boolean;
    usePointAsAnchor: boolean;
    normalizationStep: number;
    showPolygon: boolean;
    latKeyName: string;
    lngKeyName: string;
    rotationAngle: number;
    label: string;
    tooltipPattern: string;
    useTooltipFunction: boolean;
    useLabelFunction: boolean;
    pointAsAnchorFunction: GenericFunction;
    tooltipFunction: GenericFunction;
    labelFunction: GenericFunction;
};

export type actionsHandler = ($event: Event, datasource: Datasource) => void;

export type UnitedMapSettings = MapSettings & PolygonSettings & MarkerSettings & PolylineSettings & TripAnimationSettings;

export const defaultSettings: any = {
    xPosKeyName: 'xPos',
    yPosKeyName: 'yPos',
    markerOffsetX: 0.5,
    markerOffsetY: 1,
    latKeyName: 'latitude',
    lngKeyName: 'longitude',
    polygonKeyName: 'coordinates',
    showLabel: false,
    label: '${entityName}',
    showTooltip: false,
    useDefaultCenterPosition: false,
    showTooltipAction: 'click',
    autocloseTooltip: false,
    showPolygon: false,
    labelColor: '#000000',
    color: '#FE7569',
    polygonColor: '#0000ff',
    polygonStrokeColor: '#fe0001',
    polygonOpacity: 0.5,
    polygonStrokeOpacity: 1,
    polygonStrokeWeight: 1,
    useLabelFunction: false,
    markerImages: [],
    strokeWeight: 2,
    strokeOpacity: 1.0,
    initCallback: () => { },
    defaultZoomLevel: 8,
    disableScrollZooming: false,
    minZoomLevel: 16,
    credentials: '',
    markerClusteringSetting: null,
    draggableMarker: false,
    editablePolygon: false,
    fitMapBounds: true,
    mapPageSize: DEFAULT_MAP_PAGE_SIZE
};

export const hereProviders = [
    'HERE.normalDay',
    'HERE.normalNight',
    'HERE.hybridDay',
    'HERE.terrainDay'
];
