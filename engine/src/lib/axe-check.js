/**
 * Runs axe-core rules on every page and turns violations into one finding per page.
 * @param {any} ctx
 * @param {{ rules: string[], width?: number, title: (n: number) => string, impact: string, fix: string, describe: (node: any) => string }} o
 */
export async function axeCheck(ctx, { rules, width = 1280, title, impact, fix, describe }) {
  const results = [];
  for (const page of await ctx.crawl.browserPages()) {
    const p = await ctx.browser.open(page.url, { width });
    const { violations } = await p.axe(rules);
    const nodes = violations.flatMap((v) => v.nodes.map((n) => ({ ...n, rule: v.id })));
    if (!nodes.length) continue;
    const selector = nodes[0].target?.[0] ?? null;
    const text = await p.evaluate((s) => document.querySelector(s)?.textContent?.trim().slice(0, 40) ?? "", selector).catch(() => "");
    const source = text ? await ctx.guessSource(text, page) : null;
    results.push(ctx.fail({
      key: page.path,
      title: title(nodes.length),
      impact,
      location: { url: page.path, viewport: width, selector, ...(source ?? {}) },
      evidence: nodes.slice(0, 4).map(describe).join("; ") + (nodes.length > 4 ? `; and ${nodes.length - 4} more` : ""),
      fix,
      shot: selector ? await p.screenshot({ highlight: selector }) : null,
    }));
  }
  return results.length ? results : [ctx.pass()];
}
