// @ts-check
const eslint = require("@eslint/js");
const tseslint = require("typescript-eslint");
const angular = require("angular-eslint");

module.exports = tseslint.config(
  {
    files: ["**/*.ts"],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.recommended,
      ...angular.configs.tsRecommended,
    ],
    processor: angular.processInlineTemplates,
    rules: {
      // Angular modernization migrations (inject(), standalone, OnPush) are
      // separate projects, not lint hygiene.
      "@angular-eslint/prefer-inject": "off",
      "@angular-eslint/prefer-standalone": "off",
      "@angular-eslint/prefer-on-push-component-change-detection": "off",
      "@typescript-eslint/no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      // Warn until typing the covered-affix map (audit F6) drives the count down.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    files: ["**/*.html"],
    extends: [...angular.configs.templateRecommended],
    rules: {
      // Migrating remaining *ngIf/*ngFor to @if/@for is a separate project.
      "@angular-eslint/template/prefer-control-flow": "off",
    },
  },
);
