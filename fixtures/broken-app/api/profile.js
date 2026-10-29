// sec.cors: copies back whoever asks, and allows their login to come along
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin);
  res.setHeader("Access-Control-Allow-Credentials", "true");
  const user = await getUser(req.headers.cookie);
  res.status(200).json(user);
}

async function getUser() {
  return { name: "Fixture" };
}
