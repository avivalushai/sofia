import { formatBytes } from "../../lib/text.js";
import { onSlowPhone } from "../../lib/throttle.js";

const HEAVY_BYTES = 250 * 1024;
const MANY_HOSTS = 8;

/** @type {import("../../types.js").Check} */
export default {
  id: "perf.third-party",
  layer: "browser",
  async run(ctx) {
    const [home] = await ctx.crawl.browserPages();
    if (!home) return [ctx.pass()];
    const own = ctx.targetUrl.hostname.replace(/^www\./, "");
    const byHost = new Map();
    await onSlowPhone(ctx.browser, home.url, async (page) => page.waitForTimeout(3000), {
      beforeGoto: (page, cdp) => {
        const urls = new Map();
        cdp.on("Network.responseReceived", (e) => urls.set(e.requestId, { url: e.response.url, type: e.type }));
        cdp.on("Network.loadingFinished", (e) => {
          const r = urls.get(e.requestId);
          if (!r || r.type !== "Script") return;
          const host = new URL(r.url).hostname;
          if (host.replace(/^www\./, "").endsWith(own) || host === "localhost" || host === "127.0.0.1") return;
          const h = byHost.get(host) ?? { bytes: 0, files: 0 };
          h.bytes += e.encodedDataLength;
          h.files++;
          byHost.set(host, h);
        });
      },
    });
    const total = [...byHost.values()].reduce((s, h) => s + h.bytes, 0);
    if (total <= HEAVY_BYTES && byHost.size <= MANY_HOSTS) return [ctx.pass()];
    const top = [...byHost].sort((a, b) => b[1].bytes - a[1].bytes);
    return [ctx.fail({
      key: "site",
      title: `Scripts from ${byHost.size} other services weigh down the page`,
      impact: "Chat widgets, trackers and embeds from other companies load and run before your page settles; on a phone that's seconds of waiting you don't control",
      location: { url: home.path, viewport: 390 },
      evidence: `${formatBytes(total)} of scripts from other services on the home page; heaviest: ${top.slice(0, 4).map(([h, v]) => `${h} ${formatBytes(v.bytes)}`).join(", ")}`,
      fix: "Remove services you no longer use, and load the rest later",
      options: [
        { label: "Load them after the page is ready (recommended)", detail: "Chat and widgets start after the first interaction or a few seconds; trackers after consent" },
        { label: "Remove the ones you don't use", detail: "Each one you drop is load time back and one less company seeing your visitors" },
        { label: "Keep them as they are", detail: "If every service is essential from the first second" },
      ],
    })];
  },
};
