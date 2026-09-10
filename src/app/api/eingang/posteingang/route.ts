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
 * Obergrenze je Anfrage. Jede Datei laeuft durch Virenscan und Speicher; ein
 * versehentlich markiertes Fotoalbum darf die Funktion nicht ins Zeitlimit
 * laufen lassen. Was darueber hinausgeht, wird gemeldet statt verschwiegen.
 */
const MAX_DATEIEN = 25;

/**
 * Die einfache Dateiannahme fuer den Apple-Kurzbefehl.
 *
 * Anders als /api/eingang/upload verlangt sie KEINEN Fall - genau das macht
 * den Kurzbefehl auf dem Handy zu einer einzigen Aktion. Die Datei wartet im
 * Posteingang, bis der Vermittler sie am Bildschirm einem Fall zuordnet.
 *
 * Die Dateien duerfen unter beliebigem Feldnamen kommen: Wer den Kurzbefehl
 * von Hand zusammenklickt, tippt das Feld selbst ein, und ein Tippfehler soll
 * nicht wie ein kaputter Server aussehen. Es zaehlt JEDE mitgeschickte Datei -
 * eine Mehrfachauswahl aus dem Teilen-Menue kommt als eine einzige Anfrage mit
 * mehreren Teilen an.
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

  const dateien = alleDateien(form);
  if (dateien.length === 0)
    return NextResponse.json({ ok: false, fehler: "Keine Datei empfangen." }, { status: 400 });

  // Der Rest der Auswahl wird nicht verschwiegen, sondern gezaehlt und
  // gemeldet - der Nutzer soll am Handy erfahren, was er noch einmal teilen
  // muss.
  const genommen = dateien.slice(0, MAX_DATEIEN);
  const uebersprungen = dateien.length - genommen.length;

  const angenommen: string[] = [];
  const abgelehnt: { name: string; grund: string }[] = [];

  // Nacheinander, nicht parallel: Jede Datei laeuft durch Virenscan und
  // Speicher. Fuenfundzwanzig gleichzeitig wuerden dem Scanner und der
  // Datenbankverbindung mehr abverlangen, als der Posteingang wert ist.
  for (const [i, datei] of genommen.entries()) {
    const buffer = Buffer.from(await datei.arrayBuffer());
    const ergebnis = await nimmDateiAn({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      file: { name: dateiname(datei, i), type: datei.type, size: buffer.byteLength, buffer },
    });
    if (ergebnis.ok) angenommen.push(ergebnis.name);
    else abgelehnt.push({ name: ergebnis.name, grund: ergebnis.grund ?? "Datei abgelehnt." });
  }

  if (angenommen.length === 0) {
    const grund = abgelehnt[0]?.grund ?? "Datei abgelehnt.";
    return NextResponse.json({ ok: false, fehler: grund, angenommen: 0, abgelehnt: abgelehnt.length }, { status: 422 });
  }

  return NextResponse.json({
    ok: true,
    angenommen: angenommen.length,
    abgelehnt: abgelehnt.length,
    meldung: meldung(angenommen, abgelehnt, uebersprungen),
  });
}

/**
 * Die Meldung, die der Kurzbefehl auf dem Handy anzeigt.
 *
 * Sie nennt bei mehreren Dateien immer eine ZAHL. Das ist der eigentliche
 * Schutz: Wer fuenf Bilder markiert und "3 Dateien liegen im Posteingang"
 * liest, merkt den Verlust in dieser Sekunde - nicht Tage spaeter beim
 * Zusammenstellen der Akte.
 */
function meldung(
  angenommen: string[],
  abgelehnt: { name: string; grund: string }[],
  uebersprungen: number
): string {
  const kopf =
    angenommen.length === 1 && abgelehnt.length === 0 && uebersprungen === 0
      ? `„${angenommen[0]}" liegt im Posteingang von BaufiDesk.`
      : `${angenommen.length} ${angenommen.length === 1 ? "Datei liegt" : "Dateien liegen"} im Posteingang von BaufiDesk.`;

  const teile = [kopf];
  const ersterGrund = abgelehnt[0]?.grund;
  if (ersterGrund) {
    const namen = abgelehnt.map((a) => `„${a.name}"`).join(", ");
    teile.push(`Nicht angenommen: ${namen} - ${ersterGrund}`);
  }
  if (uebersprungen > 0) {
    teile.push(
      `${uebersprungen} weitere wurden nicht mitgenommen (höchstens ${MAX_DATEIEN} auf einmal) - bitte in kleineren Gruppen teilen.`
    );
  }
  return teile.join(" ");
}

/**
 * ALLE Dateien der Anfrage, in der Reihenfolge des Formulars.
 *
 * Bis zum 10.09.2026 nahm diese Stelle nur die erste und warf den Rest
 * stillschweigend weg. Wer in WhatsApp mehrere Bilder markiert und einmal
 * teilt, schickt sie unter demselben Feldnamen in EINER Anfrage - er bekam
 * "liegt im Posteingang" gemeldet und fand dort ein einziges Bild.
 *
 * Der Feldname bleibt egal: Wer den Kurzbefehl von Hand zusammenklickt, tippt
 * ihn selbst, und ein Tippfehler soll nicht wie ein kaputter Server aussehen.
 */
function alleDateien(form: FormData): File[] {
  const dateien: File[] = [];
  for (const wert of form.values()) {
    if (wert instanceof File && wert.size > 0) dateien.push(wert);
  }
  return dateien;
}

/**
 * Kurzbefehle schicken geteilte Bilder haeufig ohne brauchbaren Namen
 * ("file", leer). Ein Name ist Pflicht - ohne ihn steht im Posteingang eine
 * namenlose Zeile, die niemand zuordnen kann.
 *
 * Der Ersatzname muss innerhalb einer Anfrage EINDEUTIG sein: Eine
 * Mehrfachauswahl bringt drei Bilder, die alle "file" heissen, und drei
 * gleichnamige Zeilen im Posteingang sind so unbrauchbar wie eine fehlende.
 * Deshalb Sekundengenauigkeit plus laufende Nummer.
 */
function dateiname(datei: File, index = 0): string {
  const roh = (datei.name ?? "").trim();
  if (roh && roh.toLowerCase() !== "file" && /\.[A-Za-z0-9]{1,8}$/.test(roh)) return roh;
  const endung = datei.type.includes("pdf") ? "pdf" : datei.type.includes("png") ? "png" : "jpg";
  const stempel = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const nummer = index === 0 ? "" : `-${index + 1}`;
  return `geteilt_${stempel}${nummer}.${endung}`;
}
