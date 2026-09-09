import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { eigeneAkteWhere } from "@/lib/auth/context";
import { resolveGeraeteToken } from "@/lib/security/geraete-token";
import { tokenAusHeader } from "@/lib/security/geraete-eingang";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Die Fallliste fuer den Apple-Kurzbefehl "An BaufiDesk teilen".
 *
 * Der Kurzbefehl zeigt sie als Auswahl an, bevor er die Datei sendet – deshalb
 * nur das Noetigste: Id zum Senden, eine Zeile zum Lesen. Bewusst NUR die
 * eigenen Akten der Organisation (eigeneAkteWhere): Wer per Auftragsbruecke an
 * einer Fremdakte arbeitet, tut das im Browser, nicht blind vom Handy aus.
 */
const MAX_FAELLE = 100;

export async function GET(req: Request) {
  const token = tokenAusHeader(req.headers.get("authorization"));
  if (!token) return NextResponse.json({ ok: false }, { status: 401 });

  const zugang = await resolveGeraeteToken(token);
  if (!zugang) return NextResponse.json({ ok: false }, { status: 401 });

  const faelle = await prisma.case.findMany({
    where: {
      ...eigeneAkteWhere(zugang.ctx),
      // Abgeschlossene und archivierte Faelle wuerden die Liste am Handy
      // zumuellen; wer dorthin nachliefert, macht das im Browser.
      status: { notIn: ["abgeschlossen", "archiviert"] },
    },
    orderBy: { updatedAt: "desc" },
    take: MAX_FAELLE,
    select: {
      id: true,
      caseNumber: true,
      applicants: { orderBy: { position: "asc" }, take: 1, select: { vorname: true, nachname: true } },
    },
  });

  return NextResponse.json({
    faelle: faelle.map((f) => {
      const a = f.applicants[0];
      const name = [a?.vorname, a?.nachname].filter(Boolean).join(" ");
      // Ein Fall ohne Antragsteller darf keine Zeile mit baumelndem Trennzeichen
      // ergeben – am Handy ist die Zeile alles, was man zum Treffen hat.
      return { id: f.id, bezeichnung: name ? `${f.caseNumber} · ${name}` : f.caseNumber };
    }),
  });
}
