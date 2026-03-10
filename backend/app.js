import express from "express";
import cors from "cors";
import crypto from "node:crypto";

const DEFAULT_ALLOWED_ORIGIN = "http://localhost:3000";
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_CODE_LENGTH = 20000;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 60000;
const DEFAULT_RATE_LIMIT_MAX_REQUESTS = 20;
const VALID_LEVELS = new Set(["beginner", "intermediate", "advanced"]);
const VALID_LANGUAGES = new Set([
  "auto",
  "javascript",
  "typescript",
  "python",
  "java",
  "cpp",
  "csharp",
]);

export function extractTextFromResponse(data) {
  return (
    data?.output_text?.trim() ||
    data?.output
      ?.flatMap((item) => item?.content || [])
      ?.filter((item) => item?.type === "output_text")
      ?.map((item) => item?.text || "")
      ?.join("\n")
      ?.trim() ||
    ""
  );
}

function buildPrompt({ code, level, language }) {
  return `
You are CodeLens, a structured code explanation assistant.

Audience level: ${level}
Programming language: ${language}

Return in markdown with these sections:
1) Summary (2-4 bullets)
2) Step-by-step explanation
3) Key concepts
4) Potential issues / improvements

Keep the explanation practical, accurate, and concise.

CODE:
\`\`\`
${code}
\`\`\`
`.trim();
}

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    dispose: () => clearTimeout(timeout),
  };
}

function sanitizeValue(value, fallback, allowedValues) {
  return typeof value === "string" && allowedValues.has(value) ? value : fallback;
}

function createCorsOptions(allowedOrigin) {
  if (allowedOrigin === "*") {
    return { origin: true };
  }

  const allowed = allowedOrigin
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin not allowed by CORS"));
    },
  };
}

function createRateLimiter(windowMs, maxRequests) {
  const store = new Map();

  return function rateLimit(req, res, next) {
    const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      res.setHeader("retry-after", Math.ceil((entry.resetAt - now) / 1000));
      res.status(429).json({
        error: "Rate limit exceeded. Please try again shortly.",
      });
      return;
    }

    entry.count += 1;
    next();
  };
}

export function createApp({
  apiKey,
  fetchImpl = fetch,
  allowedOrigin = DEFAULT_ALLOWED_ORIGIN,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  maxCodeLength = DEFAULT_MAX_CODE_LENGTH,
  model = "gpt-4.1-mini",
  rateLimitWindowMs = DEFAULT_RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests = DEFAULT_RATE_LIMIT_MAX_REQUESTS,
} = {}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY fehlt in backend/.env");
  }

  const app = express();

  app.use(cors(createCorsOptions(allowedOrigin)));
  app.use(express.json({ limit: "1mb" }));

  app.use((req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("x-request-id", req.requestId);
    next();
  });

  app.get("/health", (req, res) => {
    res.json({
      status: "ok",
      model,
      maxCodeLength,
      requestId: req.requestId,
    });
  });

  app.use("/explain", createRateLimiter(rateLimitWindowMs, rateLimitMaxRequests));

  app.post("/explain", async (req, res) => {
    try {
      const code = typeof req.body?.code === "string" ? req.body.code : "";
      const level = sanitizeValue(req.body?.level, "beginner", VALID_LEVELS);
      const language = sanitizeValue(req.body?.language, "auto", VALID_LANGUAGES);

      if (!code.trim()) {
        return res.status(400).json({ error: "No code provided." });
      }

      if (code.length > maxCodeLength) {
        return res.status(413).json({
          error: `Code is too long. Maximum length is ${maxCodeLength} characters.`,
        });
      }

      const prompt = buildPrompt({ code, level, language });
      const timeout = createTimeoutSignal(timeoutMs);

      try {
        const response = await fetchImpl("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            input: prompt,
          }),
          signal: timeout.signal,
        });

        const data = await response.json();

        if (!response.ok) {
          const details =
            data?.error?.message ||
            (typeof data === "string" ? data : JSON.stringify(data, null, 2));

          return res.status(response.status).json({
            error: "OpenAI request failed.",
            details,
          });
        }

        const text = extractTextFromResponse(data);

        if (!text) {
          return res.status(502).json({
            error: "OpenAI response was empty.",
          });
        }

        return res.json({
          text,
          meta: {
            model,
            level,
            language,
            characters: code.length,
            requestId: req.requestId,
          },
        });
      } finally {
        timeout.dispose();
      }
    } catch (err) {
      const isAbort = err?.name === "AbortError";
      const message =
        err?.message ||
        (typeof err === "string" ? err : JSON.stringify(err, null, 2));

      console.error(`[${req.requestId}] OpenAI error:`, err);

      return res.status(isAbort ? 504 : 500).json({
        error: isAbort ? "OpenAI request timed out." : "OpenAI request failed.",
        details: message,
      });
    }
  });

  return app;
}
