export class WorkspaceApiError extends Error {
  constructor(
    message: string,
    public readonly uncertain = false,
  ) {
    super(message);
  }
}
export async function workspaceRequest(
  path: string,
  method: string,
  body?: unknown,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new WorkspaceApiError(
      "The response was not received. Your request may have been accepted.",
      true,
    );
  }
  if (response.status === 401) {
    window.location.assign("/sign-in");
    throw new WorkspaceApiError("Your session expired. Sign in again.");
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch {
    throw new WorkspaceApiError(
      "The server returned an unreadable response. The request may have been accepted.",
      true,
    );
  }
  if (!response.ok) {
    const problem = result as { detail?: string };
    throw new WorkspaceApiError(
      problem.detail ?? "The request could not be completed.",
      response.status >= 500,
    );
  }
  return result;
}
