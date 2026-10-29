const ALLOWED = "https://tidy.example";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  const user = await getUser(req.headers.cookie);
  res.status(200).json(user);
}

async function getUser() {
  return { name: "Fixture" };
}
