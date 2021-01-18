///
/// Copyright © 2021 ThingsBoard, Inc.
///

import LeafletMap from '../leaflet-map';
import { UnitedMapSettings } from '../map-models';

export class OpenStreetMap extends LeafletMap {
    constructor(ctx: any, $container, options: UnitedMapSettings) {
        super(ctx, $container, options);
        const map =  (window as any).L.map($container, {
          editable: !!options.editablePolygon
        }).setView(options?.defaultCenterPosition, options?.defaultZoomLevel);
        let tileLayer;
        if (options.useCustomProvider) {
          tileLayer = (window as any).L.tileLayer(options.customProviderTileUrl);
        } else {
          tileLayer = ((window as any).L.tileLayer as any).provider(options.mapProvider || 'OpenStreetMap.Mapnik');
        }
        tileLayer.addTo(map);
        super.initSettings(options);
        super.setMap(map);
    }
}
