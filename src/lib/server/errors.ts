export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super("forbidden", message, 403);
    this.name = "ForbiddenError";
  }
}

export function errorPayload(err: unknown): { code: string; message: string; status: number } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message, status: err.status };
  }
  if (err instanceof Error && err.message === "Unauthorized") {
    return { code: "unauthorized", message: "Unauthorized", status: 401 };
  }
  return { code: "unknown", message: "unexpected", status: 500 };
}
