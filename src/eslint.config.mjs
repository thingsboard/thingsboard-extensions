import {defineConfig, globalIgnores} from "eslint/config";
import eslintBaseConfig from "../eslint.config.mjs";

export default defineConfig([
  {
    extends: [eslintBaseConfig],
  },
  globalIgnores(["!**/*"]),
  {
    files: ["**/*.ts"],

    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",

      parserOptions: {
        project: ["tsconfig.lib.json"],
        createDefaultProgram: true,
      },
    },

    rules: {
      "@angular-eslint/directive-selector": ["error", {
        type: "attribute",
        prefix: "tb",
        style: "camelCase",
      }],

      "@angular-eslint/component-selector": ["error", {
        type: "element",
        prefix: "tb",
        style: "kebab-case",
      }],
    },
  }, {
    files: ["**/*.html"],
    rules: {},
  }
]);
