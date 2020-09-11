///
/// Copyright © 2020 ThingsBoard
///

import { JsonSettingsSchema } from '@shared/public-api';
import { MapProviders } from './map-models';

export interface MapWidgetInterface {
    onResize();
    update();
    onInit?();
    onDestroy?();
}

export interface MapWidgetStaticInterface {
    settingsSchema(mapProvider?: MapProviders, drawRoutes?: boolean): JsonSettingsSchema;
    getProvidersSchema(mapProvider?: MapProviders, ignoreImageMap?: boolean): JsonSettingsSchema;
    dataKeySettingsSchema(): object;
    actionSources(): object;
}
