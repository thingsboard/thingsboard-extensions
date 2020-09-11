///
/// Copyright © 2020 ThingsBoard
///

import { FormattedData, MarkerSettings } from './map-models';
import {
  aspectCache,
  bindPopupActions,
  createTooltip,
  fillPattern,
  parseWithTranslation,
  processPattern,
  safeExecute
} from './maps-utils';
import { isDefined, isDefinedAndNotNull } from '@core/public-api';
import LeafletMap from './leaflet-map';

const tinycolor = (window as any).tinycolor;

export class Marker {
    leafletMarker: any;
    tooltipOffset: any;
    markerOffset: any;
    tooltip: any;
    data: FormattedData;
    dataSources: FormattedData[];

  constructor(private map: LeafletMap, private location: any, public settings: MarkerSettings,
              data?: FormattedData, dataSources?, onDragendListener?) {
        this.setDataSources(data, dataSources);
        this.leafletMarker = (window as any).L.marker(location, {
            draggable: settings.draggableMarker
        });

        this.markerOffset = [
          isDefined(settings.markerOffsetX) ? settings.markerOffsetX : 0.5,
          isDefined(settings.markerOffsetY) ? settings.markerOffsetY : 1,
        ];

        this.createMarkerIcon((iconInfo) => {
            this.leafletMarker.setIcon(iconInfo.icon);
            this.tooltipOffset = [0, -iconInfo.size[1] * this.markerOffset[1] + 10];
            this.updateMarkerLabel(settings);
        });

        if (settings.showTooltip) {
            this.tooltip = createTooltip(this.leafletMarker, settings, data.$datasource);
            this.updateMarkerTooltip(data);
        }

        if (this.settings.markerClick) {
            this.leafletMarker.on('click', (event: any) => {
                for (const action in this.settings.markerClick) {
                    if (typeof (this.settings.markerClick[action]) === 'function') {
                        this.settings.markerClick[action](event.originalEvent, this.data.$datasource);
                    }
                }
            });
        }

        if (onDragendListener) {
            this.leafletMarker.on('dragend', (e) => onDragendListener(e, this.data));
        }
    }

    setDataSources(data: FormattedData, dataSources: FormattedData[]) {
        this.data = data;
        this.dataSources = dataSources;
    }

    updateMarkerTooltip(data: FormattedData) {
      if (!this.map.markerTooltipText || this.settings.useTooltipFunction) {
        const pattern = this.settings.useTooltipFunction ?
          safeExecute(this.settings.tooltipFunction, [this.data, this.dataSources, this.data.dsIndex]) : this.settings.tooltipPattern;
        this.map.markerTooltipText = parseWithTranslation.prepareProcessPattern(pattern, true);
        this.map.replaceInfoTooltipMarker = processPattern(this.map.markerTooltipText, data);
      }
      this.tooltip.setContent(fillPattern(this.map.markerTooltipText, this.map.replaceInfoTooltipMarker, data));
      if (this.tooltip.isOpen() && this.tooltip.getElement()) {
        bindPopupActions(this.tooltip, this.settings, data.$datasource);
      }
    }

    updateMarkerPosition(position) {
      if (!this.location.equals(position)) {
        this.location = position;
        this.leafletMarker.setLatLng(position);
      }
    }

    updateMarkerLabel(settings: MarkerSettings) {
        this.leafletMarker.unbindTooltip();
        if (settings.showLabel) {
            if (!this.map.markerLabelText || settings.useLabelFunction) {
              const pattern = settings.useLabelFunction ?
                safeExecute(settings.labelFunction, [this.data, this.dataSources, this.data.dsIndex]) : settings.label;
              this.map.markerLabelText = parseWithTranslation.prepareProcessPattern(pattern, true);
              this.map.replaceInfoLabelMarker = processPattern(this.map.markerLabelText, this.data);
            }
            settings.labelText = fillPattern(this.map.markerLabelText, this.map.replaceInfoLabelMarker, this.data);
            this.leafletMarker.bindTooltip(`<div style="color: ${settings.labelColor};"><b>${settings.labelText}</b></div>`,
                { className: 'tb-marker-label', permanent: true, direction: 'top', offset: this.tooltipOffset });
        }
    }

    updateMarkerColor(color) {
        this.createDefaultMarkerIcon(color, (iconInfo) => {
            this.leafletMarker.setIcon(iconInfo.icon);
        });
    }

    updateMarkerIcon(settings: MarkerSettings) {
        this.createMarkerIcon((iconInfo) => {
            this.leafletMarker.setIcon(iconInfo.icon);
            this.tooltipOffset = [0, -iconInfo.size[1] * this.markerOffset[1] + 10];
            this.updateMarkerLabel(settings);
        });
    }

    createMarkerIcon(onMarkerIconReady) {
        if (this.settings.icon) {
            onMarkerIconReady({
                size: [30, 30],
                icon: this.settings.icon,
            });
            return;
        }
        const currentImage = this.settings.useMarkerImageFunction ?
            safeExecute(this.settings.markerImageFunction,
                [this.data, this.settings.markerImages, this.dataSources, this.data.dsIndex]) : this.settings.currentImage;
        let currentColor = this.settings.tinyColor;
        if (this.settings.useColorFunction) {
          const functionColor = safeExecute(this.settings.colorFunction,
            [this.data, this.dataSources, this.data.dsIndex]);
          if (isDefinedAndNotNull(functionColor)) {
            currentColor = tinycolor(functionColor);
          }
        }
        if (currentImage && currentImage.url) {
            aspectCache(currentImage.url).subscribe(
                (aspect) => {
                    if (aspect) {
                        let width;
                        let height;
                        if (aspect > 1) {
                            width = currentImage.size;
                            height = currentImage.size / aspect;
                        } else {
                            width = currentImage.size * aspect;
                            height = currentImage.size;
                        }
                        const icon = (window as any).L.icon({
                            iconUrl: currentImage.url,
                            iconSize: [width, height],
                            iconAnchor: [width * this.markerOffset[0], height * this.markerOffset[1]],
                            popupAnchor: [0, -height]
                        });
                        const iconInfo = {
                            size: [width, height],
                            icon
                        };
                        onMarkerIconReady(iconInfo);
                    } else {
                        this.createDefaultMarkerIcon(currentColor, onMarkerIconReady);
                    }
                }
            );
        } else {
            this.createDefaultMarkerIcon(currentColor, onMarkerIconReady);
        }
    }

    createDefaultMarkerIcon(color: tinycolor.Instance, onMarkerIconReady) {
      let icon: { size: number[], icon: any };
      if (!tinycolor.equals(color, this.settings.tinyColor)) {
        icon = this.createColoredMarkerIcon(color);
      } else {
        if (!this.map.defaultMarkerIconInfo) {
          this.map.defaultMarkerIconInfo = this.createColoredMarkerIcon(color);
        }
        icon = this.map.defaultMarkerIconInfo;
      }
      onMarkerIconReady(icon);
    }

    createColoredMarkerIcon(color: tinycolor.Instance): { size: number[], icon: any } {
      return {
            size: [21, 34],
            icon: (window as any).L.icon({
              iconUrl: 'https://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|' + color.toHex(),
              iconSize: [21, 34],
              iconAnchor: [21 * this.markerOffset[0], 34 * this.markerOffset[1]],
              popupAnchor: [0, -34],
              shadowUrl: 'https://chart.apis.google.com/chart?chst=d_map_pin_shadow',
              shadowSize: [40, 37],
              shadowAnchor: [12, 35]
        })
      };
    }

    removeMarker() {
        /*     this.map$.subscribe(map =>
                 this.leafletMarker.addTo(map))*/
    }

    extendBoundsWithMarker(bounds) {
        bounds.extend(this.leafletMarker.getLatLng());
    }

    getMarkerPosition() {
        return this.leafletMarker.getLatLng();
    }

    setMarkerPosition(latLng) {
        this.leafletMarker.setLatLng(latLng);
    }
}
