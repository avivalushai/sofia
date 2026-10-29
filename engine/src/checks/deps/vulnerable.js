const OSV = "https://api.osv.dev/v1";
const SERIOUS = new Set(["HIGH", "CRITICAL"]);

/** Installed versions of the project's own dependencies, from the lockfile. */
async function installed(project) {
  // what ships with the site; dev tools (devDependencies) never reach visitors
  const direct = Object.keys(project.pkg?.dependencies ?? {});
  const lockText = await project.read("package-lock.json");
  if (lockText) {
    const lock = JSON.parse(lockText);
    const pkgs = lock.packages ?? {};
    return direct.map((name) => ({ name, version: pkgs[`node_modules/${name}`]?.version ?? lock.dependencies?.[name]?.version })).filter((d) => d.version);
  }
  // pnpm and yarn: "name@version" entries
  const other = (await project.read("pnpm-lock.yaml")) ?? (await project.read("yarn.lock"));
  if (!other) return null;
  const out = [];
  for (const name of direct) {
    const esc = name.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    const m = other.match(new RegExp(`(?:^|\\n)\\s*['"]?/?${esc}[@(/](\\d+\\.\\d+\\.\\d+[^'"():\\s,]*)`)) ?? other.match(new RegExp(`"?${esc}@[^\\n]*:\\n\\s+version:? "?(\\d+\\.\\d+\\.\\d+[^"\\s]*)`));
    if (m) out.push({ name, version: m[1] });
  }
  return out;
}

/** @type {import("../../types.js").Check} */
export default {
  id: "deps.vulnerable",
  layer: "mechanical",
  async run(ctx) {
    if (!ctx.project.pkg) return [ctx.pass()];
    const deps = await installed(ctx.project);
    if (!deps) return [ctx.uncertain({ key: "site", title: "Couldn't tell which library versions are installed", evidence: "there's no lockfile (package-lock.json, pnpm-lock.yaml or yarn.lock), so the exact versions aren't known", fix: "Run npm install once to create package-lock.json and commit it" })];
    if (!deps.length) return [ctx.pass()];
    let batch;
    try {
      const r = await fetch(`${OSV}/querybatch`, { method: "POST", body: JSON.stringify({ queries: deps.map((d) => ({ package: { name: d.name, ecosystem: "npm" }, version: d.version })) }), signal: AbortSignal.timeout(15_000) });
      batch = await r.json();
    } catch (e) {
      return [ctx.uncertain({ key: "site", title: "Couldn't reach the vulnerability database", evidence: `osv.dev: ${e.message}` })];
    }
    const hits = [];
    for (const [i, res] of (batch.results ?? []).entries()) for (const v of res.vulns ?? []) hits.push({ dep: deps[i], id: v.id });
    if (!hits.length) return [ctx.pass()];
    // how serious each one is (the batch answer only has ids)
    const serious = [];
    for (const h of hits.slice(0, 40)) {
      const v = await fetch(`${OSV}/vulns/${h.id}`, { signal: AbortSignal.timeout(10_000) }).then((r) => r.json()).catch(() => null);
      const sev = String(v?.database_specific?.severity ?? "").toUpperCase();
      if (SERIOUS.has(sev)) serious.push({ ...h, sev, summary: v.summary ?? "", fixed: v.affected?.flatMap((a) => a.ranges ?? []).flatMap((r) => r.events ?? []).map((e) => e.fixed).filter(Boolean)[0] });
    }
    if (!serious.length) return [ctx.pass()];
    const byDep = new Map();
    for (const s of serious) byDep.set(s.dep.name, [...(byDep.get(s.dep.name) ?? []), s]);
    return [ctx.fail({
      key: "site",
      title: byDep.size === 1 ? "A library the site uses has a known security hole" : `${byDep.size} libraries the site uses have known security holes`,
      impact: "These are published weaknesses with ready-made ways to exploit them; attackers scan sites for exactly these versions",
      location: { file: "package.json" },
      evidence: [...byDep].slice(0, 5).map(([name, list]) => `${name}@${list[0].dep.version}: ${list.length} ${list[0].sev.toLowerCase()} (${list[0].summary.slice(0, 70)}${list[0].fixed ? `; fixed in ${list[0].fixed}` : ""})`).join("; "),
      fix: `Update ${[...byDep.keys()].slice(0, 4).join(", ")} to a fixed version (npm install <name>@latest, then run the app and the tests); I'll do the updates one at a time so each can be checked`,
    })];
  },
};
