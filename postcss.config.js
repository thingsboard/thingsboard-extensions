const path = require("path");

const loadTbClassesPlugin = path.resolve('./load-tb-classes.js');

module.exports = {
  syntax: 'postcss-scss',
  plugins: {
    [loadTbClassesPlugin]: {},
    tailwindcss: {},
    autoprefixer: {}
  }
}
