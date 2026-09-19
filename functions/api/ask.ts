interface PagesContext {
  request: Request;
}

export const onRequestPost = async (context: PagesContext): Promise<Response> => {
  let body: { message?: unknown } = {};

  try {
    body = (await context.request.json()) as { message?: unknown };
  } catch {
    return Response.json(
      { error: "INVALID_REQUEST", message: "Send a valid JSON request body." },
      { status: 400 },
    );
  }

  if (typeof body.message !== "string" || body.message.trim().length === 0) {
    return Response.json(
      { error: "INVALID_MESSAGE", message: "A message is required." },
      { status: 400 },
    );
  }

  if (body.message.length > 4000) {
    return Response.json(
      { error: "MESSAGE_TOO_LONG", message: "Messages must be 4,000 characters or fewer." },
      { status: 413 },
    );
  }

  return Response.json(
    {
      error: "MODEL_NOT_CONFIGURED",
      message: "Ask EdgeCase is ready, but no model provider is connected yet.",
    },
    { status: 503 },
  );
};
