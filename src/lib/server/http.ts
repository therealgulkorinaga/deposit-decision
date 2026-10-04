import "server-only";
import { z } from "zod";
import { NotImplementedError } from "../../services/errors";
import { getEnvironment } from "./env";

export const errorResponse = (status: number, code: string, message: string) =>
  Response.json({ error: { code, message } }, { status });

export function createPostHandler<I extends z.ZodType, O extends z.ZodType>(
  input: I,
  output: O,
  handler: (value: z.output<I>) => Promise<z.input<O>>,
  successStatus = 200
) {
  return async (request: Request) => {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(
        400,
        "INVALID_JSON",
        "Send a valid JSON request body."
      );
    }
    const parsed = input.safeParse(body);
    if (!parsed.success)
      return errorResponse(
        422,
        "INVALID_REQUEST",
        "Request does not match the service contract."
      );
    try {
      getEnvironment();
      const result = await handler(parsed.data);
      return Response.json(output.parse(result), { status: successStatus });
    } catch (error) {
      if (error instanceof NotImplementedError)
        return errorResponse(501, "NOT_IMPLEMENTED", error.message);
      return errorResponse(
        500,
        "INTERNAL_ERROR",
        "The server could not complete this operation."
      );
    }
  };
}
