"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

type Level = "beginner" | "intermediate" | "advanced";
type Language = "auto" | "javascript" | "typescript" | "python" | "java" | "cpp" | "csharp";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
const MAX_CODE_LENGTH = 20000;

export default function Home() {
  const [code, setCode] = useState<string>("");
  const [level, setLevel] = useState<Level>("beginner");
  const [language, setLanguage] = useState<Language>("auto");
  const [result, setResult] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [copied, setCopied] = useState(false);

  const remainingCharacters = MAX_CODE_LENGTH - code.length;
  const isOverLimit = remainingCharacters < 0;

  const onExplain = async () => {
    if (!code.trim() || isOverLimit) {
      return;
    }

    setStatus("loading");
    setCopied(false);
    setResult("");

    try {
      const res = await fetch(`${API_BASE_URL}/explain`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          code,
          level,
          language,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("error");
        setResult(`## Request failed\n\n${data.error || "Unknown error"}\n\n${data.details || ""}`);
        return;
      }

      setStatus("success");
      setResult(data.text);
    } catch {
      setStatus("error");
      setResult("## Backend unavailable\n\nCould not reach the backend. Check whether the backend is running and reachable.");
    }
  };

  const onCopy = async () => {
    if (!result) {
      return;
    }

    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <main className="page-shell">
      <div className="ambient ambient-left" />
      <div className="ambient ambient-right" />

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">OpenAI code explanations</p>
          <h1>CodeLens</h1>
          <p className="hero-text">
            Turn raw source code into a structured walkthrough with the right level of depth, better
            readability, and faster feedback.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-label">Output</span>
            <strong>Markdown</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Model</span>
            <strong>OpenAI</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Mode</span>
            <strong>{level}</strong>
          </div>
        </div>
      </section>

      <section className="workspace-grid">
        <div className="panel input-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Input</p>
              <h2>Paste your code</h2>
            </div>
            <span className={`char-badge ${isOverLimit ? "char-badge-danger" : ""}`}>
              {code.length}/{MAX_CODE_LENGTH}
            </span>
          </div>

          <label className="field-label" htmlFor="source-code">
            Source
          </label>
          <textarea
            id="source-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Paste your code here..."
            className="code-input"
          />

          <div className="control-grid">
            <div>
              <label className="field-label" htmlFor="level">
                Level
              </label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value as Level)}
                className="select-input"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="language">
                Language
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => setLanguage(e.target.value as Language)}
                className="select-input"
              >
                <option value="auto">Auto-detect</option>
                <option value="javascript">JavaScript</option>
                <option value="typescript">TypeScript</option>
                <option value="python">Python</option>
                <option value="java">Java</option>
                <option value="cpp">C++</option>
                <option value="csharp">C#</option>
              </select>
            </div>
          </div>

          <div className="action-row">
            <button
              onClick={onExplain}
              disabled={!code.trim() || isOverLimit || status === "loading"}
              className="primary-button"
            >
              {status === "loading" ? "Explaining..." : "Explain code"}
            </button>

            <p className={`status-pill status-${status}`}>
              {isOverLimit
                ? `Reduce input by ${Math.abs(remainingCharacters)} characters`
                : status === "loading"
                  ? "Request in progress"
                  : status === "success"
                    ? "Ready"
                    : status === "error"
                      ? "Needs attention"
                      : "Idle"}
            </p>
          </div>
        </div>

        <div className="panel output-panel">
          <div className="panel-header">
            <div>
              <p className="panel-kicker">Output</p>
              <h2>Structured explanation</h2>
            </div>

            <button
              type="button"
              onClick={onCopy}
              disabled={!result}
              className="secondary-button"
            >
              {copied ? "Copied" : "Copy markdown"}
            </button>
          </div>

          <div className="result-card">
            {result ? (
              <article className="markdown-body">
                <ReactMarkdown>{result}</ReactMarkdown>
              </article>
            ) : (
              <div className="empty-state">
                <p className="empty-title">No explanation yet</p>
                <p className="empty-copy">
                  Add code on the left, choose the depth you want, and generate a structured walkthrough.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
