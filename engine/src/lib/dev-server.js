/**
 * A local scan of an app run by its development server (Vite, Next dev…): code arrives unbundled and
 * unminified, so loading speed measured here says nothing about the live site.
 */
export function onDevServer(ctx) {
  return ctx.isLocalTarget && Boolean(ctx.project.pkg?.scripts?.dev);
}

export const DEV_SERVER_SKIP = "a local development server sends code unbundled, so speed measured here isn't the live site's; scan the live site (or a production build) to measure it";
