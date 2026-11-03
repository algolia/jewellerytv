module.exports = {
  forbidden: [
    {
      name: 'no-shared-to-runtime',
      severity: 'error',
      comment: 'Shared contracts stay independent of server and browser runtime modules.',
      from: { path: '^shared' },
      to: { path: '^src' },
    },
    {
      name: 'no-generated-or-archived-dependencies',
      severity: 'error',
      comment:
        'Generated data and archived evidence never participate in runtime dependency graphs.',
      from: { path: '^(src|shared|tests)' },
      to: { path: '(^|/)(evaluation|archive|archived|runs|evidence)(/|$)' },
    },
  ],
  options: {
    doNotFollow: {
      path: '(^|/)(node_modules|evaluation|archive|archived|runs|evidence)(/|$)',
    },
    exclude: '(^|/)(node_modules|evaluation|archive|archived|runs|evidence)(/|$)',
    tsConfig: { fileName: 'tsconfig.json' },
    includeOnly: '^((server|shared|src|tests/concierge)/)',
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
    },
  },
};
