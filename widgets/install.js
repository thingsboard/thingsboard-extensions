/*
 * Copyright © 2021 ThingsBoard, Inc.
 */
const fse = require('fs-extra');
const path = require('path');

let _projectRoot = null;

(async() => {
  await fse.move(sourcePackage(),
    targetPackage(),
    {overwrite: true});
})();

function projectRoot() {
  if (!_projectRoot) {
    _projectRoot = __dirname;
  }
  return _projectRoot;
}

function sourcePackage() {
  return path.join(projectRoot(), 'dist', 'widget-extension', 'bundles', 'thingsboard-extension-widgets.umd.min.js');
}

function targetPackage() {
  return path.join(projectRoot(), 'target', 'generated-resources', 'public', 'static', 'thingsboard-extension-widgets.js');
}
