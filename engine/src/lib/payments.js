/** The payment provider a project uses, from its dependencies and code. */
const PROVIDERS = [
  { name: "Stripe", israeli: false, re: /["'](stripe|@stripe\/stripe-js|@stripe\/react-stripe-js)["']|js\.stripe\.com|checkout\.stripe\.com/ },
  { name: "PayPal", israeli: false, re: /["']@paypal\/[a-z-]+["']|paypal\.com\/sdk|paypalobjects/ },
  { name: "Lemon Squeezy", israeli: false, re: /["']@lemonsqueezy\/[a-z-.]+["']|lemonsqueezy\.com/ },
  { name: "Paddle", israeli: false, re: /["']@paddle\/[a-z-]+["']|cdn\.paddle\.com/ },
  { name: "Shopify", israeli: false, re: /["']@shopify\/[a-z-]+["']|myshopify\.com/ },
  { name: "Cardcom", israeli: true, re: /cardcom/i },
  { name: "Tranzila", israeli: true, re: /tranzila/i },
  { name: "Grow (Meshulam)", israeli: true, re: /meshulam|grow\.link|\bgrow-?payments?\b/i },
  { name: "PayPlus", israeli: true, re: /payplus/i },
  { name: "Pelecard", israeli: true, re: /pelecard/i },
  { name: "iCredit (Rivhit)", israeli: true, re: /icredit|rivhit/i },
  { name: "Hyp (YaadPay)", israeli: true, re: /yaadpay|hyp\.co\.il|\bhyp-?pay/i },
  { name: "Bit / Pepper", israeli: true, re: /\bbit-?payments?\b|bitpay\.co\.il|pepper\.co\.il/i },
];

/** @returns {Promise<{ name: string, israeli: boolean, file: string|null }[]>} */
export async function paymentProviders(project) {
  const found = new Map();
  const deps = [...project.deps].map((d) => `"${d}"`).join(" ");
  for (const p of PROVIDERS) if (p.re.test(deps)) found.set(p.name, { ...p, file: "package.json" });
  for (const f of project.files.filter((f) => /\.(jsx?|tsx?|mjs|cjs|html?|vue|svelte|astro|php|py)$/.test(f) && !/\.(test|spec)\./.test(f))) {
    const text = (await project.read(f)) ?? "";
    for (const p of PROVIDERS) if (!found.has(p.name) && p.re.test(text)) found.set(p.name, { ...p, file: f });
  }
  return [...found.values()];
}
