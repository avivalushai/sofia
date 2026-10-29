/**
 * Where a project tells its host which response headers to send. A local dev server never sends
 * the live site's headers, so on a local scan these files are the only evidence.
 */
const HEADER_FILES = [
  /^vercel\.json$/,
  /^netlify\.toml$/,
  /^(public\/|static\/)?_headers$/,
  /^firebase\.json$/,
  /^next\.config\.(js|mjs|cjs|ts)$/,
  /^(src\/)?middleware\.(js|ts)$/,
  /^nuxt\.config\.(js|ts)$/,
  /^astro\.config\.(js|mjs|ts)$/,
  /^svelte\.config\.js$/,
  /^(src\/)?hooks\.server\.(js|ts)$/,
  /^staticwebapp\.config\.json$/,
  /^render\.yaml$/,
  /^\.htaccess$|^public\/\.htaccess$/,
  /^nginx\.conf$/,
];

/** @returns {Promise<{ file: string, text: string }[]>} the files that can set headers, with their text */
export async function headerConfigs(project) {
  const out = [];
  for (const f of project.files.filter((f) => HEADER_FILES.some((re) => re.test(f)))) {
    const text = await project.read(f);
    if (text) out.push({ file: f, text });
  }
  return out;
}

/** True when the project uses a library that sets security headers for an Express-style server. */
export const usesHelmet = (project) => project.deps.has("helmet");
