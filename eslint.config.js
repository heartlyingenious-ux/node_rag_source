const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["node_modules/", ".venv-parsers/", "parsed/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
