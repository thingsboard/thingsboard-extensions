/*
 * Copyright © 2023 ThingsBoard, Inc.
 */
const STATIC_SERVE_CONFIG = {
  '/static/widgets/thingsboard-extension-widgets.js': {
    'target': 'dist/widget-extension/system/thingsboard-extension-widgets.js'
  },
  '/static/widgets/thingsboard-extension-widgets.js.map': {
    'target': `dist/widget-extension/system/thingsboard-extension-widgets.js.map`
  }
}

module.exports = STATIC_SERVE_CONFIG;
