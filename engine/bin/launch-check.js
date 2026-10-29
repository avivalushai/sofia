#!/usr/bin/env node
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 20 || (major === 20 && minor < 1)) {
  console.error(`Sofia needs Node.js 20 or newer; this computer has ${process.versions.node}. Install the LTS version from https://nodejs.org`);
  process.exit(3);
}
const { main } = await import("../src/cli.js");

process.exitCode = await main(process.argv.slice(2));
