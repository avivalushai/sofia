// sec.cookies: the login cookie has none of its safety settings
export default async function handler(req, res) {
  const token = await createSession(req);
  res.setHeader("Set-Cookie", `session=${token}; Path=/`);
  res.status(200).json({ ok: true });
}

async function createSession() {
  return "fixture-session";
}
