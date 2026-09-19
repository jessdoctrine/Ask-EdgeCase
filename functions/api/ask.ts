import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  OPENROUTER_API_KEY: string;
};

type Mode = "straight" | "evidence" | "challenge";
type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_MESSAGE_LENGTH = 6000;
const MAX_CONTEXT_MESSAGES = 20;
const MAX_OUTPUT_TOKENS = 1000;
const REQUEST_TIMEOUT_MS = 25000;
const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

const modeInstructions: Record<Mode, string> = {
  straight:
    "Answer directly and clearly. Lead with the conclusion. Do not pad the response or force agreement.",
  evidence:
    "Identify the main claims. Distinguish verified facts from inference or opinion, explain what evidence would verify them, and flag weak or missing support. Never fabricate sources or imply live web research occurred unless source material was provided.",
  challenge:
    "Give the strongest reasonable counterargument, identify assumptions and blind spots, and explain what could change the conclusion. Do not be agreeable merely to please the user.",
};

function jsonError(error: string, message: string, status: number): Response {
  return Response.json({ error, message }, { status });
}

function isMode(value: unknown): value is Mode {
  return value === "straight" || value === "evidence" || value === "challenge";
}

function isConversationMessage(value: unknown): value is ConversationMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ConversationMessage>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    message.content.length <= MAX_MESSAGE_LENGTH
  );
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  let body: {
    message?: unknown;
    mode?: unknown;
    noBs?: unknown;
    conversation?: unknown;
  };

  try {
    body = await context.request.json();
  } catch {
    return jsonError("INVALID_REQUEST", "Send a valid JSON request body.", 400);
  }

  if (!body || typeof body !== "object") {
    return jsonError("INVALID_REQUEST", "Send a valid JSON object.", 400);
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return jsonError("INVALID_MESSAGE", "A message is required.", 400);
  }

  if (body.message.length > MAX_MESSAGE_LENGTH) {
    return jsonError(
      "MESSAGE_TOO_LONG",
      `Messages must be ${MAX_MESSAGE_LENGTH.toLocaleString()} characters or fewer.`,
      413,
    );
  }

  if (body.mode !== undefined && !isMode(body.mode)) {
    return jsonError("INVALID_MODE", "Choose a supported answer mode.", 400);
  }
  const mode: Mode = body.mode ?? "straight";

  if (body.noBs !== undefined && typeof body.noBs !== "boolean") {
    return jsonError("INVALID_REQUEST", "The No BS setting must be a boolean.", 400);
  }

  if (body.conversation !== undefined && !Array.isArray(body.conversation)) {
    return jsonError("INVALID_CONVERSATION", "Conversation history must be an array.", 400);
  }

  const conversation = Array.isArray(body.conversation)
    ? body.conversation.slice(-MAX_CONTEXT_MESSAGES)
    : [];
  if (conversation.some((item) => !isConversationMessage(item))) {
    return jsonError("INVALID_CONVERSATION", "Conversation history contains an invalid message.", 400);
  }

  const apiKey = context.env.OPENROUTER_API_KEY;
  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    return jsonError(
      "MODEL_NOT_CONFIGURED",
      "Ask EdgeCase is ready, but no model provider is configured yet.",
      503,
    );
  }

  const systemPrompt = [
    "You are Ask EdgeCase, an adult-oriented, candid assistant from EdgeCaseLabs.",
    modeInstructions[mode],
    body.noBs ? "Use candid, blunt wording without being insulting, reckless, or dishonest." : "",
    "You may swear naturally, use blunt language, discuss controversial or uncomfortable topics, and disagree directly with the user.",
    "Do not censor ordinary profanity or refuse a request merely because it is rude, political, sexual, religious, offensive, or socially controversial.",
    "Do not sanitize quoted language unnecessarily. Match the user's tone when appropriate, but do not become personally abusive or use hateful slurs against protected groups.",
    "Correct false premises instead of reinforcing them. State uncertainty plainly.",
    "Never fabricate facts, citations, sources, or capabilities.",
    "Apply safety boundaries narrowly to genuinely dangerous, exploitative, or illegal assistance, not to ordinary adult conversation or unpopular opinions.",
    "When a request crosses those boundaries, refuse only the unsafe part and provide a safer alternative where useful.",
  ]
    .filter(Boolean)
    .join(" ");

  const providerMessages = [
    { role: "system", content: systemPrompt },
    ...(conversation.length > 0
      ? conversation.map((item) => ({ role: item.role, content: item.content }))
      : [{ role: "user" as const, content: body.message.trim() }]),
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const providerResponse = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
        "X-Title": "Ask EdgeCase",
      },
      body: JSON.stringify({
        model: "openrouter/free",
        messages: providerMessages,
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
    });

    if (!providerResponse.ok) {
      return jsonError(
        providerResponse.status === 429 ? "PROVIDER_BUSY" : "PROVIDER_UNAVAILABLE",
        providerResponse.status === 429
          ? "The model is busy. Please try again shortly."
          : "The model is temporarily unavailable. Please try again shortly.",
        providerResponse.status === 429 ? 429 : 502,
      );
    }

    const providerData = (await providerResponse.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };
    const content = providerData.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim().length === 0) {
      return jsonError("EMPTY_RESPONSE", "The model returned no answer. Please try again.", 502);
    }

    return Response.json({ message: content.trim(), mode });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return jsonError("REQUEST_TIMEOUT", "The model took too long to respond. Please try again.", 504);
    }
    return jsonError(
      "PROVIDER_UNAVAILABLE",
      "The model is temporarily unavailable. Please try again shortly.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
};
