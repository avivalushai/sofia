// sec.server-authz — returns any user's notes to whoever asks; the user id comes from the request
import { db } from "../lib/db.js";

export default async function handler(req, res) {
  const notes = await db.notes.findMany({ where: { userId: req.query.user } });
  res.status(200).json(notes);
}
