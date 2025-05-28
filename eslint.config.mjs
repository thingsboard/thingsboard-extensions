import eslintJS from "@eslint/js";
import tsEslint from "typescript-eslint";
import angular from "angular-eslint";
import tailwind from "eslint-plugin-tailwindcss";
import { defineConfig } from "eslint/config";

export default defineConfig([
  {
    files: ["**/*.ts"],

    extends: [
      eslintJS.configs.recommended,
      ...tsEslint.configs.recommended,
      ...tsEslint.configs.stylistic,
      ...angular.configs.tsRecommended,
    ],

    languageOptions: {
      ecmaVersion: 5,
      sourceType: "script",

      parserOptions: {
        project: ["tsconfig.json"],
        createDefaultProgram: true,
      },
    },
    processor: angular.processInlineTemplates,

    rules: {
      "@typescript-eslint/explicit-member-accessibility": [
        "off",
        {
          accessibility: "explicit"
        }
      ],
      "arrow-parens": [
        "off",
        "always"
      ],
      "@angular-eslint/component-selector": [
        "error",
        {
          prefix: [
            "tb"
          ]
        }
      ],
      "id-blacklist": [
        "error",
        "any",
        "Number",
        "String",
        "string",
        "Boolean",
        "boolean",
        "Undefined",
        "undefined"
      ],
      "import/order": "off",
      "@typescript-eslint/member-ordering": "off",
      "no-underscore-dangle": "off",
      "@typescript-eslint/naming-convention": "off",
      "@typescript-eslint/consistent-indexed-object-style": "off",
      "@typescript-eslint/array-type": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["**/*.html"],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
      ...tailwind.configs["flat/recommended"]
    ],
    rules: {
      "tailwindcss/no-custom-classname": "off",
      "tailwindcss/migration-from-tailwind-2": "off",
      "tailwindcss/enforces-negative-arbitrary-values": "off"
    }
  }
]);
