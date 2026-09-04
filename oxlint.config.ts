import { mkrz } from "@mkrz/oxlint-config";

export default mkrz(
  { repositoryType: "monorepo", typeAware: true },
  {
    ignorePatterns: ["**/prototype/**", "**/research/**"],
    overrides: [
      {
        files: ["packages/core/src/domain/errors.ts"],
        // Schema.TaggedError is a curried factory. Temporary until upstream PR #3 ships.
        rules: { "unicorn/throw-new-error": "off" },
      },
    ],
    rules: {
      // Match upstream PR #2 until a release fixes type-only import side effects.
      "import/consistent-type-specifier-style": "off",
      "typescript/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "separate-type-imports" },
      ],
      "typescript/no-import-type-side-effects": "error",
      // Effect uses _tag as its public discriminant.
      "no-underscore-dangle": "off",
    },
  },
);
