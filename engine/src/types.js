/**
 * JSDoc types shared by checks. No runtime code.
 *
 * @typedef {object} Check
 * @property {string} id      must exist in catalog/checks.json; the file path mirrors it
 * @property {"mechanical"|"browser"|"judgment"} layer
 * @property {(ctx: ReturnType<typeof import("./context.js").makeContext>) => Promise<any[]>} [run]
 */
export {};
