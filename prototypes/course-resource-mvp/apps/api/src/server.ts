import { app } from "./app.js";

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port, "0.0.0.0", () => {
  console.log(`[api] AIGC Art API running at http://localhost:${port}`);
});
