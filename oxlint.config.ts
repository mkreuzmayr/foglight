import { mkrz } from "@mkrz/oxlint-config";

export default mkrz(
  { repositoryType: "monorepo", typeAware: true },
  {
    ignorePatterns: ["**/prototype/**", "**/research/**"],
    rules: {
      // Effect uses _tag as its public discriminant.
      "no-underscore-dangle": "off",
    },
  },
);
