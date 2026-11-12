import type { Config } from "jest";

/** Unit tests (`__test__/`), the same runner as client: ts-jest, node by default, jsdom per file by docblock. */
const config: Config = {
  clearMocks: true,
  preset: "ts-jest",
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { jsx: "react-jsx", allowJs: true } }],
    "^.+\\.jsx?$": ["ts-jest", { tsconfig: { allowJs: true } }],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/e2e/", "<rootDir>/.next/"],
};

export default config;
