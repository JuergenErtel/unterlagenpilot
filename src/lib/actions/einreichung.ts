"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { loeseEinreichungsToken, reicheEin } from "@/lib/backoffice/einreichung";

/**
 * Oeffentliche Server Action des Einreichungslinks. Kein Nutzerkontext: Der
 * Token ist der einzige Schluessel. Reihenfolge wie beim Anfrageformular -
 * Honeypot, dann Zaehler, dann erst die Datenbank. Es wird nichts versendet.
 */

export type EinreichungState = { error?: string; fieldErrors?: Record<string, string> };

/** Einreichungen je Link und IP je Stunde. */
const MAX_JE_IP_STUNDE = 10;
/** Einreichungen je Link je Tag - ueber alle IPs. */
const MAX_JE_LINK_TAG = 60;

async function clientIp(): Promise<string> {
  const h = await headers();
  // x-real-ip wird von Vercel gesetzt (nicht client-spoofbar); x-forwarded-for als Fallback.
  return h.get("x-real-ip") || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function text(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

export async function einreichungAbsendenAction(token: string, _prev: EinreichungState, fd: FormData): Promise<EinreichungState> {
  // Honigtoepfchen: gefuellt heisst Maschine. Freundlich weiterleiten, nichts
  // anlegen - eine Fehlermeldung verriete die Erkennung.
  if (text(fd, "firmenzusatz") !== "") redirect(`/einreichen/${encodeURIComponent(token)}/danke`);

  // Zaehler VOR der Datenbank: Sonst kostet jede abgewiesene Einreichung
  // trotzdem eine Datenbank-Runde.
  const ip = await clientIp();
  const grenzeIp = await checkRateLimit(`einreichung:${token.slice(0, 16)}:${ip}`, MAX_JE_IP_STUNDE, 3600);
  if (!grenzeIp.ok) return { error: "Zu viele Einreichungen. Bitte versuchen Sie es später noch einmal." };
  const grenzeLink = await checkRateLimit(`einreichung:${token.slice(0, 16)}`, MAX_JE_LINK_TAG, 86400);
  if (!grenzeLink.ok) return { error: "Zu viele Einreichungen. Bitte versuchen Sie es später noch einmal." };

  const ziel = await loeseEinreichungsToken(token);
  if (!ziel) return { error: "Dieser Link ist nicht mehr gültig. Bitte wenden Sie sich an Ihr Backoffice." };

  const fieldErrors: Record<string, string> = {};
  const vorname1 = text(fd, "vorname1");
  const nachname1 = text(fd, "nachname1");
  const auftragsart = text(fd, "auftragsart", 60);
  const ansprechName = text(fd, "ansprechName");
  if (!nachname1) fieldErrors.nachname1 = "Bitte den Nachnamen angeben.";
  if (!auftragsart) fieldErrors.auftragsart = "Bitte eine Auftragsart wählen.";
  if (!ansprechName) fieldErrors.ansprechName = "Bitte eine Ansprechperson angeben.";
  if (Object.keys(fieldErrors).length > 0) return { error: "Bitte prüfen Sie die markierten Felder.", fieldErrors };

  const vorname2 = text(fd, "vorname2");
  const nachname2 = text(fd, "nachname2");
  const ergebnis = await reicheEin(ziel, {
    antragsteller1: { vorname: vorname1, nachname: nachname1, email: text(fd, "email1") || null, phone: text(fd, "phone1", 60) || null },
    antragsteller2: vorname2 || nachname2 ? { vorname: vorname2, nachname: nachname2 } : null,
    auftragsart,
    referenzExtern: text(fd, "referenz", 120) || null,
    hinweise: text(fd, "hinweise", 4000) || null,
    ansprechperson: { name: ansprechName, email: text(fd, "ansprechEmail") || null, phone: text(fd, "ansprechPhone", 60) || null },
  });
  if (!ergebnis.ok) return { error: ergebnis.grund };

  const q = new URLSearchParams({ nr: ergebnis.wert.auftragsnummer, upload: ergebnis.wert.uploadToken });
  redirect(`/einreichen/${encodeURIComponent(token)}/danke?${q.toString()}`);
}
