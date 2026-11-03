import { readFileSync } from "node:fs";
import { completeDesktopSetup } from "./desktop-setup.mjs";

try {
  await completeDesktopSetup(
    JSON.parse(readFileSync(process.argv[2], "utf8"))
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
