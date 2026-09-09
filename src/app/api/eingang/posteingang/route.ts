import { NextResponse } from "next/server";
import { nimmDateiAn } from "@/lib/eingang/service";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { resolveGeraeteToken } from "@/lib/security/geraete-token";
import { tokenAusHeader } from "@/lib/security/geraete-eingang";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Die einfache Dateiannahme fuer den Apple-Kurzbefehl.
 *
 * Anders als /api/eingang/upload verlangt sie KEINEN Fall - genau das macht
 * den Kurzbefehl auf dem Handy zu einer einzigen Aktion. Die Datei wartet im
 * Posteingang, bis der Vermittler sie am Bildschirm einem Fall zuordnet.
 *
 * Die Datei darf unter beliebigem Feldnamen kommen: Wer den Kurzbefehl von
 * Hand zusammenklickt, tippt das Feld selbst ein, und ein Tippfehler soll
 * nicht wie ein kaputter Server aussehen. Erste Datei im Formular gewinnt.
 */
export async function POST(req: Request) {
  const token = tokenAusHeader(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ ok: false, fehler: "Kein Schlüssel mitgeschickt." }, { status: 401 });

  const zugang = await resolveGeraeteToken(token);
  if (!zugang) return NextResponse.json({ ok: false, fehler: "Schlüssel unbekannt oder getrennt." }, { status: 401 });
  const ctx = zugang.ctx;

  const env = getEnv();
  const limit = await checkRateLimit(
    `eingang-posteingang:${ctx.userId}`,
    env.UPLOAD_RATE_MAX,
    env.UPLOAD_RATE_WINDOW_SEC
  );
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, fehler: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` },
      { status: 429 }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, fehler: "Keine Datei empfangen." }, { status: 400 });

  const datei = ersteDatei(form);
  if (!datei) return NextResponse.json({ ok: false, fehler: "Keine Datei empfangen." }, { status: 400 });

  const buffer = Buffer.from(await datei.arrayBuffer());
  const ergebnis = await nimmDateiAn({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    file: { name: dateiname(datei), type: datei.type, size: buffer.byteLength, buffer },
  });

  if (!ergebnis.ok) {
    return NextResponse.json({ ok: false, fehler: ergebnis.grund ?? "Datei abgelehnt." }, { status: 422 });
  }
  // Der Kurzbefehl zeigt diese Meldung auf dem Handy an - sie muss ohne
  // weiteren Blick in BaufiDesk verstaendlich sein.
  return NextResponse.json({ ok: true, meldung: `„${ergebnis.name}" liegt im Posteingang von BaufiDesk.` });
}

function ersteDatei(form: FormData): File | null {
  for (const wert of form.values()) {
    if (wert instanceof File && wert.size > 0) return wert;
  }
  return null;
}

/**
 * Kurzbefehle schicken geteilte Bilder haeufig ohne brauchbaren Namen
 * ("file", leer). Ein Name ist Pflicht - ohne ihn steht im Posteingang eine
 * namenlose Zeile, die niemand zuordnen kann.
 */
function dateiname(datei: File): string {
  const roh = (datei.name ?? "").trim();
  if (roh && roh.toLowerCase() !== "file" && /\.[A-Za-z0-9]{1,8}$/.test(roh)) return roh;
  const endung = datei.type.includes("pdf") ? "pdf" : datei.type.includes("png") ? "png" : "jpg";
  const stempel = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `geteilt_${stempel}.${endung}`;
}
