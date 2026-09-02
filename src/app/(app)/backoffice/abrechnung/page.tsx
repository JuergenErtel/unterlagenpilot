import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AbrechnungsstatusKnoepfe } from "@/components/backoffice/abrechnungsstatus-knoepfe";
import { prisma } from "@/lib/db";
import { auftraegeFilterFuer, requireBackofficeManager } from "@/lib/backoffice/zugriff";
import { berechneKontingent, vorperiode, type KontingentEreignisRoh } from "@/lib/backoffice/kontingent";
import { periodeVon } from "@/lib/backoffice/sla";
import { datumText, datumZeitText } from "@/lib/backoffice/anzeige";
import {
  BACKOFFICE_ABRECHNUNGSMODELL_LABELS,
  type BackofficeAbrechnungsmodell,
  type BackofficeAbrechnungsstatus,
} from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

function nachperiode(periode: string): string {
  const [j, m] = periode.split("-").map((x) => parseInt(x, 10));
  if (!j || !m) return periode;
  const d = new Date(Date.UTC(j, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const MONAT = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });
function periodeText(periode: string): string {
  const [j, m] = periode.split("-").map((x) => parseInt(x, 10));
  if (!j || !m) return periode;
  return MONAT.format(new Date(Date.UTC(j, m - 1, 1)));
}

export default async function AbrechnungPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireBackofficeManager();
  const jetzt = new Date();
  const sp = await searchParams;
  const roh = Array.isArray(sp.periode) ? sp.periode[0] : sp.periode;
  const periode = roh && /^\d{4}-(0[1-9]|1[0-2])$/.test(roh) ? roh : periodeVon(jetzt);
  const vor = vorperiode(periode);

  const [auftraggeberAlle, ereignisse, uebergebenAlle] = await Promise.all([
    prisma.backofficeAuftraggeber.findMany({
      where: { backofficeOrganizationId: ctx.organizationId, abrechnungsmodell: { not: "intern" } },
      select: { id: true, name: true, abrechnungsmodell: true, kontingentMonatlich: true, carryOverMax: true, aktiv: true },
      orderBy: [{ aktiv: "desc" }, { name: "asc" }],
    }),
    prisma.backofficeKontingentEreignis.findMany({
      where: { auftraggeber: { backofficeOrganizationId: ctx.organizationId }, periode: { in: [periode, vor] } },
      select: {
        id: true,
        auftraggeberId: true,
        art: true,
        menge: true,
        periode: true,
        begruendung: true,
        createdAt: true,
        auftrag: { select: { id: true, auftragsnummer: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.backofficeAuftrag.findMany({
      where: { ...auftraegeFilterFuer(ctx), uebergebenAm: { not: null } },
      select: {
        id: true,
        auftragsnummer: true,
        aktenbezeichnung: true,
        auftraggeberId: true,
        uebergebenAm: true,
        abgenommenAm: true,
        abrechnungsstatus: true,
      },
      orderBy: { uebergebenAm: "desc" },
    }),
  ]);
  const auftraggeber = auftraggeberAlle;
  const uebergeben = uebergebenAlle.filter((a) => a.uebergebenAm && periodeVon(a.uebergebenAm) === periode);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="BaufiDesk Backoffice"
        title="Abrechnung"
        subtitle="Kontingentstand und übergebene Aufträge je Auftraggeber und Periode. Keine Zahlungsabwicklung - Kontingente und Ereignisse dienen der Abrechnung."
        actions={
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm" aria-label="Vorherige Periode">
              <Link href={`/backoffice/abrechnung?periode=${vor}`}>
                <ChevronLeft />
              </Link>
            </Button>
            <span className="min-w-[9rem] text-center text-sm font-medium">{periodeText(periode)}</span>
            <Button asChild variant="outline" size="sm" aria-label="Nächste Periode">
              <Link href={`/backoffice/abrechnung?periode=${nachperiode(periode)}`}>
                <ChevronRight />
              </Link>
            </Button>
          </div>
        }
      />

      {auftraggeber.length === 0 && (
        <Card>
          <CardContent className="p-5 text-sm text-muted-foreground">
            Noch kein Auftraggeber angelegt.{" "}
            <Link href="/backoffice/auftraggeber/neu" className="text-primary underline-offset-4 hover:underline">
              Auftraggeber anlegen
            </Link>
          </CardContent>
        </Card>
      )}

      {auftraggeber.map((ag) => {
        const eigene = ereignisse.filter((e) => e.auftraggeberId === ag.id);
        const stand = berechneKontingent({
          periode,
          modell: ag.abrechnungsmodell as BackofficeAbrechnungsmodell,
          kontingentMonatlich: ag.kontingentMonatlich,
          carryOverMax: ag.carryOverMax,
          ereignisse: eigene.map((e): KontingentEreignisRoh => ({ art: e.art, menge: e.menge, periode: e.periode })),
        });
        const auftraege = uebergeben.filter((a) => a.auftraggeberId === ag.id);
        const korrekturen = eigene.filter((e) => e.periode === periode && e.art !== "verbrauch");
        return (
          <Card key={ag.id}>
            <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
              <div className="space-y-1">
                <CardTitle>
                  <Link href={`/backoffice/auftraggeber/${ag.id}`} className="underline-offset-4 hover:underline">
                    {ag.name}
                  </Link>
                </CardTitle>
                <CardDescription>{BACKOFFICE_ABRECHNUNGSMODELL_LABELS[ag.abrechnungsmodell as BackofficeAbrechnungsmodell]}</CardDescription>
              </div>
              <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Verbraucht</dt>
                  <dd className="tabular">{stand.verbraucht}</dd>
                </div>
                {stand.enthalten != null && (
                  <>
                    <div>
                      <dt className="text-xs text-muted-foreground">Enthalten</dt>
                      <dd className="tabular">
                        {stand.enthalten}
                        {stand.uebertrag > 0 && <span className="text-muted-foreground"> + {stand.uebertrag} Übertrag</span>}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Frei</dt>
                      <dd className="tabular">{stand.frei}</dd>
                    </div>
                    {stand.ueberzogen > 0 && (
                      <div>
                        <dt className="text-xs text-muted-foreground">Überzogen</dt>
                        <dd className="tabular text-destructive">{stand.ueberzogen}</dd>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <dt className="text-xs text-muted-foreground">Zusatzfälle</dt>
                  <dd className="tabular">{stand.zusatzfaelle}</dd>
                </div>
              </dl>
            </CardHeader>
            <CardContent className="space-y-4 px-0">
              <div>
                <div className="px-5 pb-2 text-xs font-medium text-muted-foreground">Übergebene Aufträge in {periodeText(periode)}</div>
                {auftraege.length === 0 ? (
                  <p className="px-5 text-sm text-muted-foreground">In dieser Periode wurde nichts übergeben.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Auftrag</TableHead>
                          <TableHead>Akte</TableHead>
                          <TableHead>Übergeben</TableHead>
                          <TableHead>Abgenommen</TableHead>
                          <TableHead>Abrechnungsstatus</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {auftraege.map((a) => (
                          <TableRow key={a.id}>
                            <TableCell className="whitespace-nowrap">
                              <Link href={`/backoffice/auftraege/${a.id}`} className="font-mono text-sm tabular text-primary underline-offset-4 hover:underline">
                                {a.auftragsnummer}
                              </Link>
                            </TableCell>
                            <TableCell>{a.aktenbezeichnung}</TableCell>
                            <TableCell className="whitespace-nowrap tabular">{datumText(a.uebergebenAm)}</TableCell>
                            <TableCell className="whitespace-nowrap tabular">
                              {a.abgenommenAm ? datumText(a.abgenommenAm) : <span className="text-muted-foreground">ausstehend</span>}
                            </TableCell>
                            <TableCell>
                              <AbrechnungsstatusKnoepfe auftragId={a.id} aktuell={a.abrechnungsstatus as BackofficeAbrechnungsstatus} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
              <div className="px-5">
                <div className="pb-2 text-xs font-medium text-muted-foreground">Korrekturen und Zusatzfälle</div>
                {korrekturen.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Keine Korrekturen in dieser Periode.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {korrekturen.map((e) => (
                      <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <span>
                          <Badge variant={e.art === "zusatzfall" ? "ai" : "neutral"}>{e.art === "zusatzfall" ? "Zusatzfall" : "Korrektur"}</Badge>
                          <span className="ml-2 tabular">{e.menge > 0 ? `+${e.menge}` : e.menge}</span>
                          {e.begruendung && <span className="ml-2 text-muted-foreground">{e.begruendung}</span>}
                        </span>
                        <span className="text-xs tabular text-muted-foreground">{datumZeitText(e.createdAt)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
