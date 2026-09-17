import { NextRequest, NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { holeMailEingang } from "@/lib/eingang/mail-abruf";
import { timingSafeEqualStrings } from "@/lib/security/timing-safe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Virenscan und HEIC-Wandlung je Anhang kosten Zeit; 25 Mails mit Anhaengen
// passen nicht in 60 Sekunden.
export const maxDuration = 300;

/**
 * Leert alle fünf Minuten das Sammelpostfach: weitergeleitete Kundenmails
 * hinein, Anhänge in den Posteingang.
 *
 * Absicherung wie bei den übrigen Cron-Routen: nur mit gesetztem CRON_SECRET
 * und passendem Bearer-Header (Vercel-Cron liefert ihn automatisch).
 */
export async function GET(req: NextRequest) {
  const env = getEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json({ ok: false, reason: "CRON_SECRET nicht gesetzt" }, { status: 503 });
  }
  if (!timingSafeEqualStrings(req.headers.get("authorization") ?? "", `Bearer ${env.CRON_SECRET}`)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const r = await holeMailEingang();
  // "nicht eingerichtet" ist kein Fehler: Bis das Postfach steht, läuft der
  // Cron ins Leere, ohne das Fehlerbuch zu fluten.
  if (r.status === "fehler") {
    console.error("[mail-eingang-cron] Abruf fehlgeschlagen:", r.meldung);
  }
  return NextResponse.json({ ok: r.status !== "fehler", ...r });
}
