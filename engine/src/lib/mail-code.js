/** Code that sends email, and what it sends through. Shared by the mail checks. */

// a mail service used in code: imported, or called by its address
export const MAIL_SERVICE = /(from\s+|require\(\s*)["'](resend|@sendgrid\/mail|postmark|mailgun\.js|mailgun-js|@getbrevo\/brevo|sib-api-v3-sdk|@emailjs\/browser|emailjs-com|@aws-sdk\/client-ses|@aws-sdk\/client-sesv2|nodemailer|@react-email\/[a-z-]+|mailersend|@sendinblue\/client|loops)["']|api\.(resend\.com|sendgrid\.com|postmarkapp\.com|mailgun\.net|brevo\.com|mailersend\.com|loops\.so)|emailjs\.send(Form)?\(/;

/** @returns {Promise<{ file: string, text: string }[]>} source files that send email */
export async function mailFiles(project) {
  const out = [];
  for (const f of project.files.filter((f) => /\.(jsx?|tsx?|mjs|cjs|php|py)$/.test(f) && !/\.(test|spec)\.|(^|\/)(tests?|__tests__)\//.test(f))) {
    const text = await project.read(f);
    if (text && (MAIL_SERVICE.test(text) || /\bmail\s*\(\s*\$/.test(text))) out.push({ file: f, text });
  }
  return out;
}

/** 1-based line of the first match, for locations. */
export const lineOf = (text, re) => {
  const m = text.match(re);
  return m ? text.slice(0, m.index).split("\n").length : 1;
};
