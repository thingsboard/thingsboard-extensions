import js from "@eslint/js";
import angular from "angular-eslint";
import tailwind from "eslint-plugin-tailwindcss";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig(
    [globalIgnores(["src/**/*"]),
    {
        files: ["**/*.ts"],

        extends: [
            js.configs.recommended,
            ...angular.configs.tsRecommended,
        ],

        processor: angular.processInlineTemplates,

        languageOptions: {
            ecmaVersion: 5,
            sourceType: "script",

            parserOptions: {
                project: ["tsconfig.json"],
                createDefaultProgram: true,
            },
        },

        rules: {
            "@typescript-eslint/explicit-member-accessibility": ["off", {
                accessibility: "explicit",
            }],

            "arrow-parens": ["off", "always"],

            "@angular-eslint/component-selector": ["error", {
                prefix: ["tb"],
            }],

            "id-blacklist": [
                "error",
                "any",
                "Number",
                "String",
                "string",
                "Boolean",
                "boolean",
                "Undefined",
                "undefined",
            ],

            "import/order": "off",
            "@typescript-eslint/member-ordering": "off",
            "no-underscore-dangle": "off",
            "@typescript-eslint/naming-convention": "off",
        },
    }, {
        files: ["**/*.html"],

        extends: [
            ...angular.configs.templateRecommended,
            tailwind.configs.recommended,
        ],

        rules: {
            "tailwindcss/no-custom-classname": "off",
            "tailwindcss/migration-from-tailwind-2": "off",
            "tailwindcss/enforces-negative-arbitrary-values": "off",
        },
    }]);