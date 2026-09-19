import type { PagesFunction } from "@cloudflare/workers-types";

type Env = {
  OPENROUTER_API_KEY: string;
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return Response.json(
    {
      functionRunning: true,
      bindingPresent: typeof context.env.OPENROUTER_API_KEY === "string",
      availableBindingNames: Object.keys(context.env),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
