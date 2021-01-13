/*
 * Copyright © 2020 ThingsBoard
 */
const STATIC_SERVE_CONFIG = {
  '/static/widgets/thingsboard-extension-widgets.js': {
    'target': 'dist/widget-extension/bundles/thingsboard-extension-widgets.umd.js'
  },
  '/static/widgets/thingsboard-extension-widgets.umd.js.map': {
    'target': `dist/widget-extension/bundles/thingsboard-extension-widgets.umd.js.map`
  }
}

module.exports = STATIC_SERVE_CONFIG;
