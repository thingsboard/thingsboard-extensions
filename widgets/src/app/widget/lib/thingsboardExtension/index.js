/*
 * Copyright © 2020 ThingsBoard
 */
import thingsboardExtensionTypes from './thingsboard-extension-types.constant';
import thingsboardExtensionConfig from './thingsboard-extension-config';

export default angular.module('thingsboardExtension', [
        thingsboardExtensionTypes
    ])
    .config(thingsboardExtensionConfig)
    .name;
