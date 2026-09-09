import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { audit } from "@/lib/audit";
import { ladeAkteFuerGeraet } from "@/lib/auth/akte-zugriff";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { processUpload } from "@/lib/documents/pipeline";
import { resolveGeraeteToken } from "@/lib/security/geraete-token";
import { tokenAusHeader } from "@/lib/security/geraete-eingang";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Wie die uebrigen Upload-Wege: OCR und KI-Einstufung laufen im Anschluss an
// die Speicherung, ein einzelnes Dokument bleibt weit darunter.
export const maxDuration = 300;

/**
 * Dateiannahme fuer den Apple-Kurzbefehl "An BaufiDesk teilen".
 *
 * Bewusst KEINE zweite Verarbeitungslogik: Die Datei geht in dieselbe Pipeline
 * wie ein Upload im Browser (Virenscan, HEIC-Wandlung, Einstufung, Zuordnung
 * zum Antragsteller). Neu ist allein der Weg herein – und der entscheidet ueber
 * den Zugriff mit demselben Regelwerk wie jede Seite (entscheideAktenzugriff).
 */
export async function POST(req: Request) {
  const token = tokenAusHeader(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  const zugang = await resolveGeraeteToken(token);
  if (!zugang) return NextResponse.json({ ok: false }, { status: 401 });
  const ctx = zugang.ctx;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ ok: false, fehler: "Keine Formulardaten empfangen." }, { status: 400 });

  const caseId = String(form.get("caseId") ?? "").trim();
  if (!caseId) return NextResponse.json({ ok: false, fehler: "Kein Fall angegeben." }, { status: 400 });

  const datei = form.get("datei");
  if (!(datei instanceof File) || datei.size === 0) {
    return NextResponse.json({ ok: false, fehler: "Keine Datei empfangen." }, { status: 400 });
  }

  const env = getEnv();
  const limit = await checkRateLimit(
    `geraete-upload:${caseId}:${ctx.userId}`,
    env.UPLOAD_RATE_MAX,
    env.UPLOAD_RATE_WINDOW_SEC
  );
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, fehler: `Zu viele Uploads. Bitte in ${limit.retryAfterSec}s erneut versuchen.` },
      { status: 429 }
    );
  }

  // Derselbe Guard wie im Browser, nur mit dem Kontext aus dem Geraetetoken.
  // Nicht vorhanden und nicht erlaubt antworten identisch (404) – sonst
  // verriete die Antwort, dass es diesen Fall gibt.
  const treffer = await ladeAkteFuerGeraet(ctx, caseId, { schreibend: true });
  if (treffer.status !== 200) return NextResponse.json({ ok: false }, { status: treffer.status });
  const akte = treffer.akte;

  const buffer = Buffer.from(await datei.arrayBuffer());
  const ergebnis = await processUpload({
    // Der Speicherpfad folgt der AKTE, nicht dem Token.
    organizationId: akte.organizationId,
    caseId,
    file: { name: datei.name, type: datei.type, size: datei.size, buffer },
    uploadSource: "vermittler",
    // Keine Zuordnung mitgeben: Am Handy waehlt niemand den Antragsteller aus,
    // und ein geratener Wert waere als "manuell" gestempelt und damit von der
    // Namenserkennung nie wieder korrigierbar (applicant-match.ts).
    applicantName: null,
    applicantId: null,
    actorUserId: ctx.userId,
  });

  await audit({
    organizationId: akte.organizationId,
    userId: ctx.userId,
    action: "geraete_token.upload",
    entityType: "case",
    entityId: caseId,
    metadata: { tokenId: zugang.tokenId, geraet: zugang.bezeichnung, ok: ergebnis.ok },
  });

  if (!ergebnis.ok) {
    return NextResponse.json(
      { ok: false, fehler: ergebnis.reason ?? "Datei konnte nicht verarbeitet werden." },
      { status: 422 }
    );
  }
  return NextResponse.json({ ok: true, dokument: datei.name });
}
