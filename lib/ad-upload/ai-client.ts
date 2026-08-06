/**
 * Lightweight OpenAI JSON helper for table extraction + column mapping.
 * Requires OPENAI_API_KEY. Heuristic fallbacks live in propose-mapping.ts.
 */

export type AiChatContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export async function openAiJsonCompletion(options: {
  system: string;
  user: AiChatContent[];
  model?: string;
}): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. CSV/XLSX still work; PDF/image extraction and AI mapping need a key.",
    );
  }

  const model = options.model ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
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
