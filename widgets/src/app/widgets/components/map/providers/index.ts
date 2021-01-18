///
/// Copyright © 2021 ThingsBoard, Inc.
///

import {
  openstreetMapSettingsSchema,
} from '../schemes';
import { OpenStreetMap } from './openstreet-map';
import { Type } from '@angular/core';
import LeafletMap from '../leaflet-map';
import { JsonSettingsSchema } from '@shared/public-api';

interface IProvider {
  MapClass: Type<LeafletMap>;
  schema: JsonSettingsSchema;
  name: string;
}

export const providerSets: { [key: string]: IProvider } = {
  'openstreet-map': {
    MapClass: OpenStreetMap,
    schema: openstreetMapSettingsSchema,
    name: 'openstreet-map'
  }
};
