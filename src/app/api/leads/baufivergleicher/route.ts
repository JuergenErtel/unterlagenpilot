import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { nimmUebergabeAn } from "@/lib/leads/baufivergleicher/aufnahme";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Leads aus baufivergleicher.de.
 *
 * Liegt vor dem Site-Gate, weil ein fremder Server kein Gate-Cookie hat –
 * dieselbe Begruendung wie beim Geraete-Eingang. Das Geheimnis steht im
 * Header, die Signatur deckt den Rumpf ab.
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unbekannt";
  // Die Domain wird laufend abgeklopft; eine offene Route ohne Deckel waere
  // eine Einladung, Geheimnisse durchzuprobieren.
  const limit = await checkRateLimit(`leads-uebergabe:${ip}`, 30, 60);
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, grund: "zu_viele_anfragen" },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSec) } }
    );
  }

  // ROHER Rumpf: Die Signatur gilt fuer genau diese Bytes. Ein ueber
  // JSON.parse und JSON.stringify gedrehter Rumpf haette eine andere.
  const rohRumpf = await req.text();
  const ergebnis = await nimmUebergabeAn(rohRumpf, {
    authorization: req.headers.get("authorization"),
    signatur: req.headers.get("x-signature"),
  });
  return NextResponse.json(ergebnis.body, { status: ergebnis.status });
}
