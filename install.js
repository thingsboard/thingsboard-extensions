/*
 * Copyright © 2023 ThingsBoard, Inc.
 */
const fse = require('fs-extra');
const path = require('path');

let _projectRoot = null;

(async () => {
  // Move the JavaScript file and its associated source map
  await moveFileWithSourceMap(sourcePackage(), targetPackage());
})();

// Function to move the main package and its source map
async function moveFileWithSourceMap(sourceFilePath, targetFilePath) {
  try {
    // Move the main JavaScript file
    await fse.move(sourceFilePath, targetFilePath, { overwrite: true });

    // Check if a source map exists and move it if found
    const sourceMapPath = `${sourceFilePath}.map`;
    const targetMapPath = `${targetFilePath}.map`;

    if (fse.pathExists(sourceMapPath)) {
      await fse.move(sourceMapPath, targetMapPath, { overwrite: true });
    }
  } catch (err) {
    console.error(`Error moving files: ${err.message}`);
  }
}

function projectRoot() {
  if (!_projectRoot) {
    _projectRoot = __dirname;
  }
  return _projectRoot;
}

function sourcePackage() {
  return path.join(projectRoot(), 'dist', 'widget-extension', 'system', 'thingsboard-extension-widgets.js');
}

function targetPackage() {
  return path.join(projectRoot(), 'target', 'generated-resources', 'thingsboard-extension-widgets.js');
}
