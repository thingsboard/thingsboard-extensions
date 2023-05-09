///
/// Copyright © 2023 ThingsBoard, Inc.
///

// import L, {
//   FeatureGroup,
//   Icon,
//   LatLngBounds,
//   LatLngTuple,
//   markerClusterGroup,
//   MarkerClusterGroup,
//   MarkerClusterGroupOptions
// } from 'leaflet';
// import 'leaflet-providers';
// import 'leaflet.markercluster/dist/leaflet.markercluster';
import {
  defaultSettings,
  FormattedData,
  MapSettings,
  MarkerSettings,
  ReplaceInfo,
  UnitedMapSettings
} from './map-models';
import { Marker } from './markers';
import { Observable, of } from 'rxjs';
// import { Polyline } from './polyline';
// import { Polygon } from './polygon';
import { createLoadingDiv, parseData, safeExecute } from './maps-utils';
// import { WidgetContext } from '@home/models/widget-component.models';
import { isDefinedAndNotNull, isString } from '@core/public-api';


export default abstract class LeafletMap {
   markers: Map<string, Marker> = new Map();
    // polylines: Map<string, Polyline> = new Map();
    // polygons: Map<string, Polygon> = new Map();
    map: any;
    options: UnitedMapSettings;
    bounds: any;
    datasources: FormattedData[];
    markersCluster: any;
    points: any;
    markersData: FormattedData[] = [];
    // polygonsData: FormattedData[] = [];
    defaultMarkerIconInfo: { size: number[], icon: any };
    loadingDiv: JQuery<HTMLElement>;
    loading = false;
    replaceInfoLabelMarker: Array<ReplaceInfo> = [];
    markerLabelText: string;
    replaceInfoTooltipMarker: Array<ReplaceInfo> = [];
    markerTooltipText: string;
    drawRoutes: boolean;
    showPolygon: boolean;
    updatePending = false;
    addMarkers: [] = [];
    // addPolygons: L.Polygon[] = [];

    protected constructor(public ctx: any,
                          public $container: HTMLElement,
                          options: UnitedMapSettings) {
        this.options = options;
    }

    public initSettings(options: MapSettings) {
        this.options.tinyColor = (window as any).tinycolor(this.options.color || defaultSettings.color);
        const { disableScrollZooming,
            useClusterMarkers,
            zoomOnClick,
            showCoverageOnHover,
            removeOutsideVisibleBounds,
            animate,
            chunkedLoading,
            maxClusterRadius,
            maxZoom }: MapSettings = options;
        if (disableScrollZooming) {
            this.map.scrollWheelZoom.disable();
        }
        if (useClusterMarkers) {
            const clusteringSettings: any = {
                zoomToBoundsOnClick: zoomOnClick,
                showCoverageOnHover,
                removeOutsideVisibleBounds,
                animate,
                chunkedLoading
            };
            if (maxClusterRadius && maxClusterRadius > 0) {
                clusteringSettings.maxClusterRadius = Math.floor(maxClusterRadius);
            }
            if (maxZoom && maxZoom >= 0 && maxZoom < 19) {
                clusteringSettings.disableClusteringAtZoom = Math.floor(maxZoom);
            }
            this.markersCluster = (window as any).L.markerClusterGroup(clusteringSettings);
        }
    }

    public setLoading(loading: boolean) {
      if (this.loading !== loading) {
        this.loading = loading;
        if (this.loading) {
          if (!this.loadingDiv) {
            this.loadingDiv = createLoadingDiv(this.ctx.translate.instant('common.loading'));
          }
          this.$container.append(this.loadingDiv[0]);
        } else {
          if (this.loadingDiv) {
            this.loadingDiv.remove();
          }
        }
        this.ctx.detectChanges();
      }
    }

    public setMap(map: any) {
        this.map = map;
        if (this.options.useDefaultCenterPosition) {
          this.map.panTo(this.options.defaultCenterPosition);
          this.bounds = map.getBounds();
        } else {
          this.bounds = new (window as any).L.LatLngBounds(null, null);
        }
        // if (this.options.draggableMarker) {
        //     this.addMarkerControl();
        // }
        // if (this.options.editablePolygon) {
        //   this.addPolygonControl();
        // }
        if (this.options.useClusterMarkers) {
          this.map.addLayer(this.markersCluster);
        }
        if (this.updatePending) {
          this.updatePending = false;
          this.updateData(this.drawRoutes, this.showPolygon);
        }
    }

    public saveMarkerLocation(datasource: FormattedData, lat?: number, lng?: number): Observable<any> {
      return of(null);
    }

    public savePolygonLocation(datasource: FormattedData, coordinates?: Array<[number, number]>): Observable<any> {
      return of(null);
    }

    createLatLng(lat: number, lng: number):any {
        return (window as any).L.latLng(lat, lng);
    }

    createBounds() {
        return this.map.getBounds();
    }

    extendBounds(bounds, polyline) {
        if (polyline && polyline.getLatLngs() && polyline.getBounds()) {
            bounds.extend(polyline.getBounds());
        }
    }

    invalidateSize() {
        this.map?.invalidateSize(true);
    }

    onResize() {

    }

    getCenter() {
        return this.map.getCenter();
    }

    fitBounds(bounds, padding?) {
        if (bounds.isValid()) {
            this.bounds = !!this.bounds ? this.bounds.extend(bounds) : bounds;
            if (!this.options.fitMapBounds && this.options.defaultZoomLevel) {
                this.map.setZoom(this.options.defaultZoomLevel, { animate: false });
                if (this.options.useDefaultCenterPosition) {
                    this.map.panTo(this.options.defaultCenterPosition, { animate: false });
                }
                else {
                    this.map.panTo(this.bounds.getCenter());
                }
            } else {
                this.map.once('zoomend', () => {
                    let minZoom = this.options.minZoomLevel;
                    if (this.options.defaultZoomLevel) {
                      minZoom = Math.max(minZoom, this.options.defaultZoomLevel);
                    }
                    if (this.map.getZoom() > minZoom) {
                        this.map.setZoom(minZoom, { animate: false });
                    }
                });
                if (this.options.useDefaultCenterPosition) {
                    this.bounds = this.bounds.extend(this.options.defaultCenterPosition);
                }
                this.map.fitBounds(this.bounds, { padding: padding || [50, 50], animate: false });
                this.map.invalidateSize();
            }
        }
    }

    convertPosition(expression: object) {
      if (!expression) {
        return null;
      }
      const lat = expression[this.options.latKeyName];
      const lng = expression[this.options.lngKeyName];
      if (!isDefinedAndNotNull(lat) || isString(lat) || isNaN(lat) || !isDefinedAndNotNull(lng) || isString(lng) || isNaN(lng)) {
        return null;
      }
      return (window as any).L.latLng(lat, lng);
    }

    convertPositionPolygon(expression) {
          return (expression).map((el) => {
            if (!Array.isArray(el[0]) && el.length === 2) {
              return el;
            } else if (Array.isArray(el) && el.length) {
              return this.convertPositionPolygon(el);
            } else {
              return null;
            }
        }).filter(el => !!el);
    }

    convertToCustomFormat(position): object {
        return {
            [this.options.latKeyName]: position.lat % 90,
            [this.options.lngKeyName]: position.lng % 180
        };
    }

    convertToPolygonFormat(points: Array<any>): Array<any> {
      if (points.length) {
        return points.map(point => {
          if (point.length) {
            return this.convertToPolygonFormat(point);
          } else {
            return [point.lat, point.lng];
          }
        });
      } else {
        return [];
      }
    }

    convertPolygonToCustomFormat(expression: any[][]): object {
      return {
        [this.options.polygonKeyName] : this.convertToPolygonFormat(expression)
      };
    }

    updateData(drawRoutes: boolean, showPolygon: boolean) {
      this.drawRoutes = drawRoutes;
      this.showPolygon = showPolygon;
      if (this.map) {
        // const data = this.ctx.data;
        const formattedData = parseData(this.ctx.data);
        // if (drawRoutes) {
        //   this.updatePolylines(parseArray(data), false);
        // }
        // if (showPolygon) {
        //   this.updatePolygons(formattedData, false);
        // }
        this.updateMarkers(formattedData, false);
        this.updateBoundsInternal();
        if (this.options.draggableMarker || this.options.editablePolygon) {
          this.datasources = formattedData;
        }
      } else {
        this.updatePending = true;
      }
    }

  private updateBoundsInternal() {
    const bounds = new (window as any).L.LatLngBounds(null, null);
    // if (this.drawRoutes) {
    //   this.polylines.forEach((polyline) => {
    //     bounds.extend(polyline.leafletPoly.getBounds());
    //   });
    // }
    // if (this.showPolygon) {
    //   this.polygons.forEach((polygon) => {
    //     bounds.extend(polygon.leafletPoly.getBounds());
    //   });
    // }
    if ((this.options as MarkerSettings).useClusterMarkers && this.markersCluster.getBounds().isValid()) {
      bounds.extend(this.markersCluster.getBounds());
    } else {
      this.markers.forEach((marker) => {
        bounds.extend(marker.leafletMarker.getLatLng());
      });
    }

    const mapBounds = this.map.getBounds();
    if (bounds.isValid() && (!this.bounds || !this.bounds.isValid() || !this.bounds.equals(bounds) && !mapBounds.contains(bounds))) {
      this.bounds = bounds;
      this.fitBounds(bounds);
    }
  }

  // Markers
    updateMarkers(markersData: FormattedData[], updateBounds = true, callback?) {
      const rawMarkers = markersData.filter(mdata => !!this.convertPosition(mdata));
      const toDelete = new Set(Array.from(this.markers.keys()));
      const createdMarkers: Marker[] = [];
      const updatedMarkers: Marker[] = [];
      const deletedMarkers: Marker[] = [];
      let m: Marker;
      rawMarkers.forEach(data => {
        if (data.rotationAngle || data.rotationAngle === 0) {
          const currentImage = this.options.useMarkerImageFunction ?
            safeExecute(this.options.markerImageFunction,
              [data, this.options.markerImages, markersData, data.dsIndex]) : this.options.currentImage;
          const style = currentImage ? 'background-image: url(' + currentImage.url + ');' : '';
          this.options.icon = (window as any).L.divIcon({
            html: `<div class="arrow"
                 style="transform: translate(-10px, -10px)
                 rotate(${data.rotationAngle}deg);
                 ${style}"><div>`
          });
        } else {
          this.options.icon = null;
        }
        if (this.markers.get(data.entityName)) {
          m = this.updateMarker(data.entityName, data, markersData, this.options);
          if (m) {
            updatedMarkers.push(m);
          }
        } else {
          m = this.createMarker(data.entityName, data, markersData, this.options as MarkerSettings, updateBounds, callback);
          if (m) {
            createdMarkers.push(m);
          }
        }
        toDelete.delete(data.entityName);
      });
      toDelete.forEach((key) => {
        m = this.deleteMarker(key);
        if (m) {
          deletedMarkers.push(m);
        }
      });
      this.markersData = markersData;
      if ((this.options as MarkerSettings).useClusterMarkers) {
        if (createdMarkers.length) {
          this.markersCluster.addLayers(createdMarkers.map(marker => marker.leafletMarker));
        }
        if (updatedMarkers.length) {
          this.markersCluster.refreshClusters(updatedMarkers.map(marker => marker.leafletMarker));
        }
        if (deletedMarkers.length) {
          this.markersCluster.removeLayers(deletedMarkers.map(marker => marker.leafletMarker));
        }
      }
    }

    dragMarker = (e, data = {} as FormattedData) => {
        if (e.type !== 'dragend') {
          return;
        }
        this.saveMarkerLocation({ ...data, ...this.convertToCustomFormat(e.target._latlng) }).subscribe();
    }

    private createMarker(key: string, data: FormattedData, dataSources: FormattedData[], settings: MarkerSettings,
                         updateBounds = true, callback?): Marker {
      const newMarker = new Marker(this, this.convertPosition(data), settings, data, dataSources, this.dragMarker);
      if (callback) {
        newMarker.leafletMarker.on('click', () => {
          callback(data, true);
        });
      }
      if (this.bounds && updateBounds && !(this.options as MarkerSettings).useClusterMarkers) {
        this.fitBounds(this.bounds.extend(newMarker.leafletMarker.getLatLng()));
      }
      this.markers.set(key, newMarker);
      if (!this.options.useClusterMarkers) {
        this.map.addLayer(newMarker.leafletMarker);
      }
      return newMarker;
    }

    private updateMarker(key: string, data: FormattedData, dataSources: FormattedData[], settings: MarkerSettings): Marker {
        const marker: Marker = this.markers.get(key);
        const location = this.convertPosition(data);
        marker.updateMarkerPosition(location);
        if (settings.showTooltip) {
            marker.updateMarkerTooltip(data);
        }
        marker.setDataSources(data, dataSources);
        marker.updateMarkerIcon(settings);
        return marker;
    }

    deleteMarker(key: string): Marker {
      const marker = this.markers.get(key);
      const leafletMarker = marker?.leafletMarker;
      if (leafletMarker) {
          if (!this.options.useClusterMarkers) {
            this.map.removeLayer(leafletMarker);
          }
          this.markers.delete(key);
      }
      return marker;
    }
  //
  //   deletePolygon(key: string) {
  //     const polygon = this.polygons.get(key)?.leafletPoly;
  //     if (polygon) {
  //       this.map.removeLayer(polygon);
  //       this.polygons.delete(key);
  //     }
  //     return polygon;
  //   }
  //
  //   updatePoints(pointsData: FormattedData[], getTooltip: (point: FormattedData, setTooltip?: boolean) => string) {
  //     if (this.points) {
  //         this.map.removeLayer(this.points);
  //     }
  //     this.points = new FeatureGroup();
  //     pointsData.filter(pdata => !!this.convertPosition(pdata)).forEach(data => {
  //         const point = L.circleMarker(this.convertPosition(data), {
  //             color: this.options.pointColor,
  //             radius: this.options.pointSize
  //         });
  //         if (!this.options.pointTooltipOnRightPanel) {
  //             point.on('click', () => getTooltip(data));
  //         }
  //         else {
  //             createTooltip(point, this.options, data.$datasource, getTooltip(data, false));
  //         }
  //         this.points.addLayer(point);
  //     });
  //     this.map.addLayer(this.points);
  //   }
  //
  //   // Polyline
  //
  //   updatePolylines(polyData: FormattedData[][], updateBounds = true, data?: FormattedData) {
  //       const keys: string[] = [];
  //       polyData.forEach((dataSource: FormattedData[]) => {
  //           data = data || dataSource[0];
  //           if (dataSource.length && data.entityName === dataSource[0].entityName) {
  //               if (this.polylines.get(data.entityName)) {
  //                   this.updatePolyline(data, dataSource, this.options, updateBounds);
  //               } else {
  //                   this.createPolyline(data, dataSource, this.options, updateBounds);
  //               }
  //               keys.push(data.entityName);
  //           }
  //       });
  //       const toDelete: string[] = [];
  //       this.polylines.forEach((v, mKey) => {
  //         if (!keys.includes(mKey)) {
  //           toDelete.push(mKey);
  //         }
  //       });
  //       toDelete.forEach((key) => {
  //         this.removePolyline(key);
  //       });
  //   }
  //
  //   createPolyline(data: FormattedData, dataSources: FormattedData[], settings: PolylineSettings, updateBounds = true) {
  //       const poly = new Polyline(this.map,
  //           dataSources.map(el => this.convertPosition(el)).filter(el => !!el), data, dataSources, settings);
  //       if (updateBounds) {
  //         const bounds = poly.leafletPoly.getBounds();
  //         this.fitBounds(bounds);
  //       }
  //       this.polylines.set(data.entityName, poly);
  //   }
  //
  //   updatePolyline(data: FormattedData, dataSources: FormattedData[], settings: PolylineSettings, updateBounds = true) {
  //       const poly = this.polylines.get(data.entityName);
  //       const oldBounds = poly.leafletPoly.getBounds();
  //       poly.updatePolyline(dataSources.map(el => this.convertPosition(el)).filter(el => !!el), data, dataSources, settings);
  //       const newBounds = poly.leafletPoly.getBounds();
  //       if (updateBounds && oldBounds.toBBoxString() !== newBounds.toBBoxString()) {
  //           this.fitBounds(newBounds);
  //       }
  //   }
  //
  //   removePolyline(name: string) {
  //       const poly = this.polylines.get(name);
  //       if (poly) {
  //           this.map.removeLayer(poly.leafletPoly);
  //           if (poly.polylineDecorator) {
  //               this.map.removeLayer(poly.polylineDecorator);
  //           }
  //           this.polylines.delete(name);
  //       }
  //   }
  //
  //   // Polygon
  //
  // updatePolygons(polyData: FormattedData[], updateBounds = true) {
  //   const keys: string[] = [];
  //   this.polygonsData = deepClone(polyData);
  //   polyData.forEach((data: FormattedData) => {
  //     if (data && isDefinedAndNotNull(data[this.options.polygonKeyName]) && !isEmptyStr(data[this.options.polygonKeyName])) {
  //       if (isString((data[this.options.polygonKeyName]))) {
  //         data[this.options.polygonKeyName] = JSON.parse(data[this.options.polygonKeyName]);
  //       }
  //       data[this.options.polygonKeyName] = this.convertPositionPolygon(data[this.options.polygonKeyName]);
  //
  //       if (this.polygons.get(data.entityName)) {
  //         this.updatePolygon(data, polyData, this.options, updateBounds);
  //       } else {
  //         this.createPolygon(data, polyData, this.options, updateBounds);
  //       }
  //       keys.push(data.entityName);
  //     }
  //   });
  //   const toDelete: string[] = [];
  //   this.polygons.forEach((v, mKey) => {
  //     if (!keys.includes(mKey)) {
  //       toDelete.push(mKey);
  //     }
  //   });
  //   toDelete.forEach((key) => {
  //     this.removePolygon(key);
  //   });
  // }
  //
  // dragPolygonVertex = (e?, data = {} as FormattedData) => {
  //   if (e === undefined || (e.type !== 'editable:vertex:dragend' && e.type !== 'editable:vertex:deleted')) {
  //     return;
  //   }
  //   this.savePolygonLocation({ ...data, ...this.convertPolygonToCustomFormat(e.layer._latlngs) }).subscribe();
  // }
  //
  //   createPolygon(polyData: FormattedData, dataSources: FormattedData[], settings: PolygonSettings, updateBounds = true) {
  //     const polygon = new Polygon(this.map, polyData, dataSources, settings, this.dragPolygonVertex);
  //     if (updateBounds) {
  //       const bounds = polygon.leafletPoly.getBounds();
  //       this.fitBounds(bounds);
  //     }
  //     this.polygons.set(polyData.entityName, polygon);
  //   }
  //
  //   updatePolygon(polyData: FormattedData, dataSources: FormattedData[], settings: PolygonSettings, updateBounds = true) {
  //     const poly = this.polygons.get(polyData.entityName);
  //     const oldBounds = poly.leafletPoly.getBounds();
  //     poly.updatePolygon(polyData, dataSources, settings);
  //     const newBounds = poly.leafletPoly.getBounds();
  //     if (updateBounds && oldBounds.toBBoxString() !== newBounds.toBBoxString()) {
  //         this.fitBounds(newBounds);
  //     }
  //   }
  //
  //   removePolygon(name: string) {
  //     const poly = this.polygons.get(name);
  //     if (poly) {
  //       this.map.removeLayer(poly.leafletPoly);
  //       this.polygons.delete(name);
  //     }
  //   }
}
