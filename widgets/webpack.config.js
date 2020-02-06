/*
 * Copyright © 2020 ThingsBoard
 */
/* eslint-disable */

if (process.env.NODE_ENV === 'production') {
  module.exports = require('./webpack.config.prod');
} else {
  module.exports = require('./webpack.config.dev');
}
