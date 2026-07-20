import { NextResponse, type NextRequest } from "next/server";
import { forwardToApi } from "@/lib/api/proxy";
import {
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
  clearSessionCookieOptions,
} from "@/lib/api/cookies";
import {
  SessionCreateRequestSchema,
  YouVersionSignInResponseSchema,
} from "@/lib/api/contracts";

/**
 * `POST /api/auth/session` — the BFF sign-in exchange (design-delta §6a). Accepts
 * the browser's YouVersion access token, exchanges it at the API's
 * `POST /v1/auth/youversion`, sets the RAW opaque session token as an httpOnly
 * cookie, and returns ONLY `{ user, firstSignIn }` to the browser (never the
 * token). A non-200 from the API (e.g. 401 on a bad token) passes straight through
 * WITHOUT setting a cookie.
 */
export async function POST(request: NextRequest) {
  const parsed = SessionCreateRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const result = await forwardToApi({
    path: "auth/youversion",
    method: "POST",
    body: { accessToken: parsed.data.accessToken },
  });

  if (result.status !== 200) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const signIn = YouVersionSignInResponseSchema.safeParse(result.body);
  if (!signIn.success) {
    return NextResponse.json({ error: "bad_upstream_response" }, { status: 502 });
  }

  const response = NextResponse.json(
    { user: signIn.data.user, firstSignIn: signIn.data.firstSignIn },
    { status: 200 },
  );
  response.cookies.set(SESSION_COOKIE_NAME, signIn.data.token, sessionCookieOptions());
  return response;
}

/**
 * `DELETE /api/auth/session` — sign out. Best-effort revokes the server session
 * (`POST /v1/auth/signout`) then clears the httpOnly cookie so a live session is
 * never left behind. Always succeeds from the browser's perspective.
 */
export async function DELETE(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
  if (token) {
    await forwardToApi({ path: "auth/signout", method: "POST", token }).catch(() => undefined);
  }
  const response = NextResponse.json({ ok: true }, { status: 200 });
  response.cookies.set(SESSION_COOKIE_NAME, "", clearSessionCookieOptions());
  return response;
}
