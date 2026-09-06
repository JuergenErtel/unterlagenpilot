import { CaseNav } from "@/components/case/case-nav";
import { BackofficeAktenLeiste } from "@/components/case/backoffice-akten-leiste";
import { getCurrentContext } from "@/lib/auth/context";
import { prisma } from "@/lib/db";
import { istAktiv } from "@/lib/backoffice/status";
import type { BackofficeStatus } from "@/lib/domain/enums";

/**
 * Rahmen aller Fall-Unterseiten: die Bereichsleiste oben, darunter die Seite.
 *
 * Der Rahmen prueft KEINEN Zugang - das tun die Seiten selbst (requireContext
 * + Organisationsfilter). Die eine kleine Abfrage hier dient nur der Form der
 * Leiste: Eine Backoffice-Akte bekommt den Reiter "Auftrag" statt "Fallakte",
 * ein Vertriebsfall mit laufendem Auftrag eine Hinweisleiste. Eine Fremdakte
 * (Cross-Org-Uebergabe: Auftrag der eigenen Backoffice-Organisation an einer
 * Akte einer anderen Organisation) bekommt die Variante "fremd" - nur Auftrag
 * und Unterlagen; ob die Seite darunter sie zeigt, entscheidet
 * requireCaseAccess. Ohne eigenen Auftrag rendert der Rahmen die schlichte
 * Vertriebsleiste und ueberlaesst der Seite das 404.
 */
export default async function CaseLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const ctx = await getCurrentContext();

  // Der juengste Auftrag unabhaengig vom Status: Eine Backoffice-Akte braucht
  // ihren Auftrag auch nach dem Abschluss (sonst zeigte der Reiter "Auftrag"
  // ins Leere); ob die Leiste im Vertriebsfall erscheint, entscheidet
  // istAktiv unten.
  const akte = ctx
    ? await prisma.case.findUnique({
        where: { id },
        select: {
          akteArt: true,
          organizationId: true,
          backofficeAuftraege: {
            where: { backofficeOrganizationId: ctx.organizationId },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              auftragsnummer: true,
              status: true,
              faelligAm: true,
              pausiertSeit: true,
              auftraggeber: { select: { name: true } },
            },
          },
        },
      })
    : null;

  const fremd = ctx != null && akte != null && akte.organizationId !== ctx.organizationId;
  const auftrag = akte?.backofficeAuftraege[0] ?? null;
  const status = auftrag ? (auftrag.status as BackofficeStatus) : null;

  // Eigene Backoffice-Akte ODER Fremdakte mit eigenem Auftrag: der Kopf ist der Auftrag.
  const istBackofficeAkte = auftrag != null && (fremd || akte!.akteArt === "backoffice");
  const zeigeLeiste =
    auftrag != null &&
    status != null &&
    ctx?.backofficeRolle != null &&
    (istBackofficeAkte || istAktiv(status));

  return (
    <div className="space-y-6">
      {zeigeLeiste && (
        <BackofficeAktenLeiste
          auftragId={auftrag.id}
          auftragsnummer={auftrag.auftragsnummer}
          status={status}
          pausiert={auftrag.pausiertSeit != null}
          faelligAm={auftrag.faelligAm}
          auftraggeberName={istBackofficeAkte ? auftrag.auftraggeber.name : undefined}
        />
      )}
      {istBackofficeAkte ? (
        <CaseNav caseId={id} variante={fremd ? "fremd" : "backoffice"} auftragId={auftrag.id} />
      ) : (
        <CaseNav caseId={id} />
      )}
      {children}
    </div>
  );
}
