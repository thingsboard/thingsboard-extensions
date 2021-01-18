/*
 * Copyright © 2021 ThingsBoard, Inc.
 */
const STATIC_SERVE_CONFIG = {
  '/static/thingsboard-extension-widgets.js': {
    'target': 'dist/widget-extension/bundles/thingsboard-extension-widgets.umd.js'
  },
  '/static/thingsboard-extension-widgets.umd.js.map': {
    'target': `dist/widget-extension/bundles/thingsboard-extension-widgets.umd.js.map`
  }
}

module.exports = STATIC_SERVE_CONFIG;
