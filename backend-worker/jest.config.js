module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/dist/'],
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['src/**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/node_modules/@prisma/client',
    '^ioredis$': '<rootDir>/node_modules/ioredis',
    '^uuid$': '<rootDir>/node_modules/uuid',
    '^zod$': '<rootDir>/node_modules/zod',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@prisma/client$': '<rootDir>/node_modules/@prisma/client',
    '^ioredis$': '<rootDir>/node_modules/ioredis',
    '^uuid$': '<rootDir>/node_modules/uuid',
    '^zod$': '<rootDir>/node_modules/zod',
  },
};