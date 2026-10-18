/** @type {import("../../types.js").Check} */
export default {
  id: "sec.idor",
  layer: "browser",
  async run(ctx) {
    if (!(await ctx.consent.has("test-accounts"))) return [ctx.skip(ctx.consent.why("test-accounts"), { needs: "test-accounts" })];
    // Signing in as two users needs the app's login flow and the test accounts' details, which the
    // skill collects in the conversation (M3). Until that exists this check can't give an answer.
    return [ctx.uncertain({
      key: "accounts",
      title: "Couldn't test whether one user can see another's data",
      evidence: "Needs two test accounts and the app's sign-in flow, which aren't set up yet",
      fix: "",
    })];
  },
};
