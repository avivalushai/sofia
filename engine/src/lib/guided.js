/**
 * For checks that can't be confirmed from outside the site (a test purchase, a submitted sitemap, an
 * uptime monitor): "couldn't tell" with the exact steps, never a pass the engine didn't earn.
 */
export function guide(ctx, { key = "site", title, evidence, steps }) {
  return ctx.uncertain({ key, title, evidence, fix: steps.map((s, i) => `${i + 1}. ${s}`).join(" ") });
}

/** Text of every file whose path matches, joined (for "is this tool mentioned anywhere"). */
export async function textOf(project, re) {
  let out = "";
  for (const f of project.files.filter((f) => re.test(f))) out += `\n${(await project.read(f)) ?? ""}`;
  return out;
}
