import { NextResponse } from "next/server";
import {
  createMockTokens,
  findUserById,
  parseMockToken,
  toAuthUser,
} from "@/lib/mock-api/store";
import { isMockApiEnabled } from "@/lib/mock-api/enabled";

export async function POST(request: Request) {
  if (!isMockApiEnabled()) {
    return NextResponse.json({ detail: "Mock API is disabled." }, { status: 404 });
  }

  const body = await request.json();
  const userId = parseMockToken(body.refresh_token);

  if (!userId) {
    return NextResponse.json(
      { detail: "Invalid or expired refresh token." },
      { status: 401 }
    );
  }

  const user = findUserById(userId);

  if (!user) {
    return NextResponse.json({ detail: "User not found." }, { status: 401 });
  }

  return NextResponse.json({
    ...createMockTokens(user.id),
    user: toAuthUser(user),
  });
}
