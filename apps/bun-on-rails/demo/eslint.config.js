/**
 * ESLint flat config for the demo application.
 *
 * The demo lives in its own directory, so ESLint looks for a config here
 * (flat config is only picked up from the current working directory).
 * We reuse the framework's root rule set so the demo is held to the same
 * standard as `src/`, and add a JSX block for the React-style components
 * under `app/components/pages/`.
 */

import rootConfig from "../eslint.config.js";

/** Globals available in a browser context (demo components). */
const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  location: "readonly",
  history: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  fetch: "readonly",
  Response: "readonly",
  Request: "readonly",
  Headers: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  HTMLElement: "readonly",
  Element: "readonly",
  Node: "readonly",
};

/**
 * Minimal stand-in for `eslint-plugin-react`'s `jsx-uses-vars`.
 *
 * ESLint core's `no-unused-vars` does not know that a JSX element name is a
 * reference, so `import { Form } from ...` used only as `<Form />` is reported
 * as an unused variable. The plugin is not a dependency of this repo, so we
 * mark the referenced variables as used ourselves and keep `no-unused-vars`
 * fully active for JSX files.
 *
 * @type {import('eslint').ESLint.Plugin}
 */
const jsxUsesVars = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Mark variables referenced only by JSX element names as used",
    },
    schema: [],
  },
  rules: {
    "jsx-uses-vars": {
      create(context) {
        const sourceCode = context.getSourceCode();

        /** @param {string} name @param {import('estree').Node} node */
        const markUsed = (name, node) => {
          sourceCode.markVariableAsUsed(name, node);
        };

        return {
          JSXOpeningElement(node) {
            const name = node.name;

            if (name.type === "JSXIdentifier") {
              // <PostCard /> or <Form />
              markUsed(name.name, name);
            } else if (name.type === "JSXMemberExpression") {
              // <Form.Input />
              let object = name;

              while (object.type === "JSXMemberExpression") {
                object = object.object;
              }

              if (object.type === "JSXIdentifier") {
                markUsed(object.name, object);
              }
            }
          },
        };
      },
    },
  },
};

export default [
  ...rootConfig,

  {
    // React-style single file components
    files: ["**/*.jsx"],
    plugins: {
      jsx: jsxUsesVars,
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...browserGlobals,
      },
    },
    rules: {
      "jsx/jsx-uses-vars": "error",

      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-undef": "error",
      "no-console": "off",

      eqeqeq: ["error", "always"],
      "no-var": "error",
      "prefer-const": "error",
      "no-throw-literal": "error",

      strict: ["error", "never"],

      "no-unused-expressions": "error",
      "no-empty": "error",
      "no-constant-condition": "error",
      "no-debugger": "error",
      "no-duplicate-case": "error",
      "no-extra-semi": "error",
      "no-irregular-whitespace": "error",
      "no-unreachable": "error",
    },
  },

  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
  },
];
