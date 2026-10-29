// sec.login-limit — checks the password on every request, with no limit on failed attempts
import bcrypt from "bcryptjs";
import { db } from "../lib/db.js";

export default async function handler(req, res) {
  const { email, password } = JSON.parse(req.body);
  const user = await db.users.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "wrong email or password" });
  }
  res.status(200).json({ ok: true });
}
