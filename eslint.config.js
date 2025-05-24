import js from "@eslint/js";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsparser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["build/", "dist/", "node_modules/"],
  },
  js.configs.recommended,
  // Configuração para ficheiros JS
  {
    files: ["**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        module: "readonly",
        __dirname: "readonly",
        require: "readonly",
      },
    },
    rules: {
      "no-console": "off",
    },
  },
  // Configuração para ficheiros TS
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        project: "./tsconfig.json",
        sourceType: "module",
      },
      globals: {
        console: "readonly",
        process: "readonly",
        module: "readonly",
        __dirname: "readonly",
        require: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-module-boundary-types": "warn",
      "@typescript-eslint/no-inferrable-types": "warn",
      "no-console": "off",
    },
  },
];
