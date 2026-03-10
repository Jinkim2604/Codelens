import test from "node:test";
import assert from "node:assert/strict";
import { createApp, extractTextFromResponse } from "./app.js";

async function withServer(app, callback) {
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, () => resolve(instance));
  });

  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}

test("extractTextFromResponse reads output_text directly", () => {
  assert.equal(extractTextFromResponse({ output_text: "hello" }), "hello");
});

test("extractTextFromResponse reads nested output blocks", () => {
  const data = {
    output: [
      {
        content: [
          { type: "output_text", text: "first" },
          { type: "output_text", text: "second" },
        ],
      },
    ],
  };

  assert.equal(extractTextFromResponse(data), "first\nsecond");
});

test("GET /health returns config metadata", async () => {
  const app = createApp({ apiKey: "test-key", fetchImpl: async () => ({}) });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.status, "ok");
    assert.equal(data.model, "gpt-4.1-mini");
    assert.equal(data.maxCodeLength, 20000);
    assert.ok(data.requestId);
    assert.ok(response.headers.get("x-request-id"));
  });
});

test("POST /explain validates empty code", async () => {
  const app = createApp({ apiKey: "test-key", fetchImpl: async () => ({}) });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "" }),
    });

    const data = await response.json();

    assert.equal(response.status, 400);
    assert.equal(data.error, "No code provided.");
  });
});

test("POST /explain rejects oversized code", async () => {
  const app = createApp({
    apiKey: "test-key",
    maxCodeLength: 5,
    fetchImpl: async () => ({}),
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "123456" }),
    });

    const data = await response.json();

    assert.equal(response.status, 413);
    assert.match(data.error, /Maximum length is 5/);
  });
});

test("POST /explain returns extracted OpenAI text and meta", async () => {
  let requestBody = null;

  const app = createApp({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      requestBody = JSON.parse(options.body);

      return {
        ok: true,
        async json() {
          return {
            output: [
              {
                content: [{ type: "output_text", text: "Explained output" }],
              },
            ],
          };
        },
      };
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "const x = 1;",
        level: "advanced",
        language: "javascript",
      }),
    });

    const data = await response.json();

    assert.equal(response.status, 200);
    assert.equal(data.text, "Explained output");
    assert.equal(data.meta.model, "gpt-4.1-mini");
    assert.equal(data.meta.level, "advanced");
    assert.equal(data.meta.language, "javascript");
    assert.equal(data.meta.characters, 12);
    assert.ok(data.meta.requestId);
    assert.equal(requestBody.model, "gpt-4.1-mini");
    assert.match(requestBody.input, /Audience level: advanced/);
    assert.match(requestBody.input, /Programming language: javascript/);
  });
});

test("POST /explain falls back to safe defaults for invalid level and language", async () => {
  let requestBody = null;

  const app = createApp({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      requestBody = JSON.parse(options.body);

      return {
        ok: true,
        async json() {
          return { output_text: "ok" };
        },
      };
    },
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: "let x = 1;",
        level: "guru",
        language: "rust",
      }),
    });

    assert.equal(response.status, 200);
    assert.match(requestBody.input, /Audience level: beginner/);
    assert.match(requestBody.input, /Programming language: auto/);
  });
});

test("POST /explain surfaces upstream API errors", async () => {
  const app = createApp({
    apiKey: "test-key",
    fetchImpl: async () => ({
      ok: false,
      status: 401,
      async json() {
        return {
          error: {
            message: "Invalid API key",
          },
        };
      },
    }),
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "const x = 1;" }),
    });

    const data = await response.json();

    assert.equal(response.status, 401);
    assert.equal(data.error, "OpenAI request failed.");
    assert.equal(data.details, "Invalid API key");
  });
});

test("POST /explain returns timeout errors as 504", async () => {
  const app = createApp({
    apiKey: "test-key",
    timeoutMs: 5,
    fetchImpl: async (url, options) =>
      new Promise((resolve, reject) => {
        options.signal.addEventListener("abort", () => {
          const error = new Error("This operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      }),
  });

  await withServer(app, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "const x = 1;" }),
    });

    const data = await response.json();

    assert.equal(response.status, 504);
    assert.equal(data.error, "OpenAI request timed out.");
  });
});

test("POST /explain applies rate limits", async () => {
  const app = createApp({
    apiKey: "test-key",
    rateLimitWindowMs: 1000,
    rateLimitMaxRequests: 1,
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return { output_text: "ok" };
      },
    }),
  });

  await withServer(app, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "const a = 1;" }),
    });

    const second = await fetch(`${baseUrl}/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: "const b = 2;" }),
    });

    const secondData = await second.json();

    assert.equal(first.status, 200);
    assert.equal(second.status, 429);
    assert.equal(secondData.error, "Rate limit exceeded. Please try again shortly.");
    assert.ok(second.headers.get("retry-after"));
  });
});
