module.exports = {
  // preset: 'ts-jest/presets/default-esm', // Removed preset
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        // tsconfig: 'tsconfig.json', // Optional: can specify tsconfig path if not default
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1', // Allows imports without .js extension
    '^../moodle/moodle_api_client$': '<rootDir>/moodle/moodle_api_client.ts',
  },
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'], // Important for Jest to recognize .ts files as ESM
  clearMocks: true,
};
