// Puts the Hebrew dictionary where Sofia keeps it, from the dev copy in node_modules, so the tests
// never download it. Run by `npm test` before the tests.
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const engine = fileURLToPath(new URL("../../", import.meta.url));
const dir = path.join(engine, "test", ".cache", "dictionary-he-2.0.0");
await mkdir(dir, { recursive: true });
for (const f of ["index.aff", "index.dic"]) await copyFile(path.join(engine, "node_modules", "dictionary-he", f), path.join(dir, f));
