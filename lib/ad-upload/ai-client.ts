/**
 * Lightweight OpenAI JSON helper for table extraction + column mapping.
 * Requires OPENAI_API_KEY. Heuristic fallbacks live in propose-mapping.ts.
 */

export type AiChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

/** Default wall-clock timeout for OpenAI calls (never hang the parse step). */
export const OPENAI_TIMEOUT_MS = 25_000;

export async function openAiJsonCompletion(options: {
  system: string;
  user: AiChatContent[];
  model?: string;
  timeoutMs?: number;
}): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. CSV/XLSX still work; PDF/image extraction and AI mapping need a key.",
    );
  }

  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const timeoutMs = options.timeoutMs ?? OPENAI_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" || /aborted|timeout/i.test(err.message))
    ) {
      throw new Error(
        `OpenAI request timed out after ${Math.round(timeoutMs / 1000)}s. Retry or map columns manually.`,
      );
    }
    throw err instanceof Error
      ? err
      : new Error(`OpenAI request failed: ${String(err)}`);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${body.slice(0, 400)}`);
  }

  const payload = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned empty content");
  }
  return JSON.parse(content) as unknown;
}

export function hasOpenAiKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
