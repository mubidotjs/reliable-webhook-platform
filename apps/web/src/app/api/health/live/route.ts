import { NextResponse } from "next/server";

export function GET(): NextResponse {
  return NextResponse.json({
    service: "reliable-webhook-platform",
    status: "ok",
  });
}
