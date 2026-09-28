// Zero-config-ish ESLint, scoped to one job: catch identifiers that are read
// but never declared (`no-undef`).
//
// Why this file exists: `web/src/App.jsx` shipped two runtime-breaking bugs of
// exactly that shape — the packed-index unpack read an undeclared `data`, and
// the Min Signal slider read an undeclared `minSignal`. Both threw
// `ReferenceError` in the browser (the second one blanked the page), and both
// sailed through CI because `vite build` only parses and `smoke-test.mjs`
// re-implements App's decode instead of importing it.
//
// Running `no-undef` over the tree at the time flagged precisely those nine
// sites and nothing else, so it is a zero-noise gate. Keep the rule set small:
// every extra rule is a chance to trade a real bug for a stylistic failure.
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
    worker: true,
  },
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react-hooks'],
  overrides: [
    {
      // `smoke-test.mjs` is the dependency-free Node gate CI runs against the
      // built artefacts — it is never bundled for the browser, so `process`
      // is legitimate here and nowhere else.
      files: ['smoke-test.mjs', '*.cjs'],
      env: { node: true },
    },
  ],
  rules: {
    // The gate. `undefined` in a browser console means a typo'd or undeclared
    // binding, and there is no test that renders JSX to catch it otherwise.
    'no-undef': 'error',
    // Defined so the existing `// eslint-disable-next-line react-hooks/...`
    // comments in InspirationGenerator.jsx resolve instead of erroring; a
    // warning, because dep-shape opinions are not build breakers.
    'react-hooks/exhaustive-deps': 'warn',
  },
};
