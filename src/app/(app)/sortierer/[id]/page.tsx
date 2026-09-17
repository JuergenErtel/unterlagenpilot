import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { ladeBereiche } from "@/lib/backoffice/zugriff";
import { nurSortierung, nurVertrieb } from "@/lib/cases/aktenart";
import { maxUploadMb } from "@/lib/documents/pipeline";
import { countProcessingDocuments } from "@/lib/documents/processing";
import { zaehleEingang } from "@/lib/eingang/service";
import { listGeraeteTokens } from "@/lib/security/geraete-token";
import { mailEingangAdresse } from "@/lib/eingang/mail-adresse";
import { naechsteFrage, offeneFragen, type SortierDokument, type SortierBuendel } from "@/lib/sortierer/fragen";
import { stapelName, verbleibendeTage, STAPEL_LEBENSDAUER_TAGE } from "@/lib/sortierer/service";
import type { DocumentType } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { StapelFragen } from "@/components/sortierer/stapel-fragen";
import { StapelErgebnis } from "@/components/sortierer/stapel-ergebnis";
import { BrokerUploadForm } from "@/components/case/broker-upload-form";
import { AndereWege } from "@/components/eingang/andere-wege";
import { DocumentsProcessing } from "@/components/case/documents-processing";

export const dynamic = "force-dynamic";

/**
 * Ein Sortierstapel: hineingeworfen, sortiert, zurueckgegeben.
 *
 * Die Seite zeigt immer genau EINEN Zustand - sortiert gerade, fragt gerade,
 * oder ist fertig. Alles nebeneinander zu zeigen waere die Fallakte, und die
 * ist genau das, wovon der Sortierer wegfuehren soll.
 */
export default async function StapelPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireContext();
  const bereiche = await ladeBereiche(ctx);
  if (!bereiche.sortierer) notFound();

  // Nur ein Stapel DIESER Organisation. Die Aktenart-Bedingung ist kein
  // Schoenheitsfehler: Ohne sie liesse sich ueber diese Adresse ein
  // gewoehnlicher Fall in der Sortierer-Oberflaeche oeffnen - ohne die
  // Schutzmechanismen, die die Fallakte dafuer hat.
  const stapel = await prisma.case.findFirst({
    where: { id, organizationId: ctx.organizationId, ...nurSortierung },
    select: {
      id: true,
      caseNumber: true,
      createdAt: true,
      buendelStatus: true,
      documents: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          originalName: true,
          generatedName: true,
          documentType: true,
          zusammengefuegtInId: true,
          readable: true,
          reviewStatus: true,
          mimeType: true,
          ocrStatus: true,
          classificationStatus: true,
          extractionStatus: true,
          updatedAt: true,
        },
      },
      buendel: {
        orderBy: { reihenfolge: "asc" },
        select: {
          id: true,
          titel: true,
          seiten: { orderBy: { position: "asc" }, select: { documentId: true } },
        },
      },
    },
  });
  if (!stapel) notFound();

  // Zaehlt die Dokumente, die gerade durch OCR/Einstufung laufen - dieselbe
  // Regel wie in der Fallakte, inklusive Verfallszeit fuer haengende Laeufe.
  const laeuftNoch = countProcessingDocuments(stapel.documents);

  // Ein Buendelvorschlag ist "entschieden", sobald keine seiner Seiten mehr
  // lose ist - dann wurde er zusammengefuegt. Verworfene Vorschlaege loescht
  // buendelVerwerfenAction, sie tauchen hier gar nicht mehr auf.
  const loseIds = new Set(
    stapel.documents.filter((d) => d.zusammengefuegtInId === null).map((d) => d.id)
  );
  const buendel: SortierBuendel[] = stapel.buendel.map((b) => ({
    id: b.id,
    titel: b.titel,
    seitenIds: b.seiten.map((s) => s.documentId),
    entschieden: !b.seiten.some((s) => loseIds.has(s.documentId)),
  }));

  const dokumente: SortierDokument[] = stapel.documents.map((d) => ({
    id: d.id,
    name: d.generatedName ?? d.originalName,
    documentType: d.documentType as DocumentType | null,
    zusammengefuegtInId: d.zusammengefuegtInId,
    vorschlagId:
      stapel.buendel.find(
        (b) => b.seiten.some((s) => s.documentId === d.id) && loseIds.has(d.id)
      )?.id ?? null,
    readable: d.readable,
    entschieden: d.reviewStatus !== "offen",
  }));

  const frage = naechsteFrage(dokumente, buendel);
  const offen = offeneFragen(dokumente, buendel);
  // Wie viele Fragen es einmal waren: die offenen plus die schon beantworteten
  // Buendel. Nur fuer "Frage 3 von 7" - eine Zahl ohne Nenner sagt nichts.
  const gesamt = offen + buendel.filter((b) => b.entschieden).length;

  const ergebnis = stapel.documents.filter((d) => d.zusammengefuegtInId === null);
  const sortiertLaeuft = laeuftNoch > 0 || stapel.buendelStatus === "laeuft";
  const tageUebrig = verbleibendeTage(stapel.createdAt);

  const [geraete, wartend] = await Promise.all([
    listGeraeteTokens(ctx.userId),
    zaehleEingang(ctx.organizationId),
  ]);

  // Fuer "einem Fall zuordnen": nur eigene Vertriebsakten, die noch offen sind.
  const faelle = await prisma.case.findMany({
    where: {
      organizationId: ctx.organizationId,
      ...nurVertrieb,
      status: { notIn: ["abgeschlossen", "archiviert"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      caseNumber: true,
      applicants: { orderBy: { position: "asc" }, take: 1, select: { vorname: true, nachname: true } },
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Unterlagensortierer"
        title={stapelName(
          ergebnis.map((d) => d.documentType as DocumentType | null),
          ergebnis.length
        )}
        subtitle={`${stapel.caseNumber} · ${ergebnis.length} ${ergebnis.length === 1 ? "Dokument" : "Dokumente"} · wird in ${tageUebrig} ${tageUebrig === 1 ? "Tag" : "Tagen"} automatisch gelöscht`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/sortierer">
              <ArrowLeft />
              Alle Stapel
            </Link>
          </Button>
        }
      />

      {sortiertLaeuft ? (
        /* Pollt sich selbst weiter und laedt die Seite neu, sobald es fertig
           ist - ohne das saehe der Nutzer einen Stapel ohne Fragen und hielte
           ihn fuer fertig. */
        <DocumentsProcessing count={laeuftNoch} />
      ) : frage ? (
        <StapelFragen stapelId={id} frage={frage} offen={offen} gesamt={gesamt} />
      ) : (
        <StapelErgebnis
          stapelId={id}
          dokumente={ergebnis.map((d) => ({
            id: d.id,
            name: d.generatedName ?? d.originalName,
            typ: (d.documentType as DocumentType | null) ?? null,
          }))}
          faelle={faelle.map((f) => {
            const a = f.applicants[0];
            const name = [a?.vorname, a?.nachname].filter(Boolean).join(" ");
            return { id: f.id, bezeichnung: name ? `${f.caseNumber} · ${name}` : f.caseNumber };
          })}
        />
      )}

      <section className="space-y-2">
        <h2 className="eyebrow">Mehr hineinwerfen</h2>
        <div className="flaeche-blatt rounded-lg p-4">
          {/* Ohne Antragsteller: Ein Stapel hat keine, und eine geratene
              Zuordnung waere als "manuell" gestempelt und danach von der
              Namenserkennung unantastbar. */}
          <BrokerUploadForm caseId={id} maxMb={maxUploadMb()} applicants={[]} />
        </div>
        <AndereWege
          geraetVerbunden={geraete.length > 0}
          wartendImPosteingang={wartend}
          mailAdresse={mailEingangAdresse()}
          titel="Oder liegen sie auf dem Handy?"
        />
        <p className="t-hilfe flex items-center gap-1.5 text-xs">
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Stapel werden nach {STAPEL_LEBENSDAUER_TAGE} Tagen automatisch gelöscht – samt Dateien.
        </p>
      </section>
    </div>
  );
}
