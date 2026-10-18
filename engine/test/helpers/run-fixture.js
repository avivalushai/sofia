// Manual dev helper: serves a fixture copy on a free port and runs the engine against it.
//   node test/helpers/run-fixture.js [fixture] [-- extra engine args]
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { copyFixture, serveFixture } from "./serve.js";

const name = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : "broken-landing";
const extra = process.argv.slice(process.argv.indexOf("--") + 1 || process.argv.length);
const dir = await copyFixture(name);
const site = await serveFixture(dir);
const bin = fileURLToPath(new URL("../../bin/launch-check.js", import.meta.url));
await new Promise((resolve) => spawn(process.execPath, [bin, "run", "--target", site.url, ...extra], { cwd: dir, stdio: "inherit" }).on("close", resolve));
console.log(`project copy: ${dir}`);
await site.close();
