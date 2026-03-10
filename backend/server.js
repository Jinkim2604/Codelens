import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("OPENAI_API_KEY fehlt in backend/.env");
  process.exit(1);
}

const PORT = Number(process.env.PORT || 3001);
const app = createApp({
  apiKey,
  allowedOrigin: process.env.ALLOWED_ORIGIN || "http://localhost:3000",
  timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS || 30000),
  maxCodeLength: Number(process.env.MAX_CODE_LENGTH || 20000),
  model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
  rateLimitWindowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60000),
  rateLimitMaxRequests: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 20),
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
