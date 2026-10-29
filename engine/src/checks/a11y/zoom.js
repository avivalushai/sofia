/** @type {import("../../types.js").Check} */
export default {
  id: "a11y.zoom",
  layer: "mechanical",
  async run(ctx) {
    const results = [];
    for (const page of await ctx.crawl.pages()) {
      const vp = page.meta("viewport");
      if (!vp) continue;
      const noScale = /user-scalable\s*=\s*(no|0)/i.test(vp);
      const max = Number(vp.match(/maximum-scale\s*=\s*([\d.]+)/i)?.[1] ?? Infinity);
      if (!noScale && !(max < 2)) continue;
      results.push(ctx.fail({
        key: page.path,
        title: "Zooming in is blocked on phones",
        impact: "People with weaker eyesight can't pinch to enlarge the text, so parts of the site are unreadable for them (it's also an accessibility requirement)",
        location: { url: page.path, file: await ctx.pageSource(page) },
        evidence: `<meta name="viewport" content="${vp}">`,
        fix: 'Remove user-scalable=no and maximum-scale from the viewport tag: content="width=device-width, initial-scale=1"',
      }));
    }
    return results.length ? results : [ctx.pass()];
  },
};
