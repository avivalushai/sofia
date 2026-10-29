const MEDIA = /\.(png|jpe?g|gif|webp|avif|svg|pdf|mp4|mov|webm|mp3|docx?|xlsx?|pptx?)$/i;
// folders that aren't published with the site
const NOT_SHIPPED = /(^|\/)(docs?|tests?|__tests__|e2e|fixtures|scripts|\.github|design|mockups|screenshots|promo|marketing)\//i;

/** Names that come straight from a phone, a screenshot tool or a download. */
const MEANINGLESS = [
  /^screen ?shot[\s_-]/i,
  /^צילום מסך/,
  /^(IMG|DSC|DSCN|DCIM|PXL|MVIMG|VID)[_-]?\d{3,}/i,
  /^WhatsApp (Image|Video)/i,
  /^(image|untitled|unnamed|download|file|photo|picture|pic|new|copy|ללא שם)( ?\(\d+\)|[-_ ]?\d+)?$/i,
  /\(\d+\)$/,
  /^copy of|^עותק של/i,
  /(^|[-_ ])(final|draft|old|backup|temp|tmp|test)([-_ ]?\d+)?$|[-_ ]v\d+$/i,
  // a random hash or ID nobody can read
  /^[a-f0-9-]{16,}$/i,
  /^(?=(?:.*\d){4})[A-Za-z0-9]{20,}$/,
];

/** @type {import("../../types.js").Check} */
export default {
  id: "content.file-names",
  layer: "mechanical",
  async run(ctx) {
    const bad = ctx.project.files.filter((f) => {
      if (!MEDIA.test(f) || NOT_SHIPPED.test(f)) return false;
      const base = f.split("/").pop().replace(/\.[^.]+$/, "");
      return MEANINGLESS.some((re) => re.test(base));
    });
    if (!bad.length) return [ctx.pass()];
    return [ctx.fail({
      key: "site",
      title: bad.length === 1 ? "A file on the site has a meaningless name" : `${bad.length} files on the site have meaningless names`,
      impact: "These names show up when people save an image or open a PDF, and in image search, and they make the site look unfinished. Search engines also use file names to understand images",
      location: { file: bad[0] },
      evidence: bad.slice(0, 6).join(", ") + (bad.length > 6 ? `, and ${bad.length - 6} more` : ""),
      fix: "Rename each file to describe what it shows (for example team-photo.jpg or pricing-guide.pdf) and update the places that use it",
    })];
  },
};
