import Link from "next/link";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { uebernehmenAction } from "@/lib/actions/backoffice";
import type { AuftragZeile } from "@/lib/backoffice/auftraege";
import { auftragsartLabel } from "@/lib/backoffice/leistungen";
import { bewerteSla } from "@/lib/backoffice/sla";
import { datumZeitText } from "@/lib/backoffice/anzeige";
import { AktionKnopf } from "./aktion-formular";
import { FristMarke, PrioritaetMarke, StatusMarke } from "./status-anzeigen";

/**
 * Die Auftragsliste des Backoffice - eine Tabelle fuer Queue, Auftraege,
 * Themenlisten und Auftraggeber. Server-Komponente; der einzige Client-Teil
 * ist der Uebernehmen-Knopf.
 */

export type ListenZiel = "auftrag" | "unterlagen";

function zielHref(z: AuftragZeile, ziel: ListenZiel): string {
  return ziel === "unterlagen" ? `/cases/${z.caseId}/unterlagen` : `/backoffice/auftraege/${z.id}`;
}

function Zaehler({ n, einzahl, mehrzahl, tone }: { n: number; einzahl: string; mehrzahl: string; tone: "warnung" | "info" | "blocker" }) {
  if (n <= 0) return null;
  const farbe = tone === "blocker" ? "text-destructive" : tone === "warnung" ? "text-[hsl(var(--warning))]" : "text-ai";
  return (
    <span className={cn("block whitespace-nowrap text-xs tabular", farbe)}>
      {n} {n === 1 ? einzahl : mehrzahl}
    </span>
  );
}

export function AuftragsListe({
  zeilen,
  jetzt,
  kompakt = false,
  ziel = "auftrag",
  uebernehmen = false,
  leerText = "Keine Aufträge in dieser Auswahl.",
}: {
  zeilen: AuftragZeile[];
  jetzt: Date;
  /** Weniger Spalten - fuer Auftraggeberseite und Nebenlisten. */
  kompakt?: boolean;
  /** Wohin die Auftragsnummer fuehrt. */
  ziel?: ListenZiel;
  /** Uebernehmen-Knopf fuer nicht zugewiesene Auftraege zeigen. */
  uebernehmen?: boolean;
  leerText?: string;
}) {
  if (zeilen.length === 0) {
    return <p className="px-1 py-3 text-sm text-muted-foreground">{leerText}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Auftrag</TableHead>
            <TableHead>Akte</TableHead>
            <TableHead>Auftraggeber</TableHead>
            {!kompakt && <TableHead>Auftragsart</TableHead>}
            <TableHead>Status</TableHead>
            <TableHead>Frist</TableHead>
            {!kompakt && <TableHead>Bearbeiter</TableHead>}
            <TableHead>Offen</TableHead>
            {!kompakt && <TableHead>Letzte Aktivität</TableHead>}
            {uebernehmen && <TableHead className="text-right">Aktion</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {zeilen.map((z) => {
            const pausiert = z.pausiertSeit != null;
            const ueberfaellig =
              bewerteSla({ faelligAm: z.faelligAm, status: z.status, pausiert, jetzt }).zustand === "ueberschritten";
            const nichtsOffen = z.fehlendeUnterlagen === 0 && z.ungepruefteDokumente === 0 && z.offeneRueckfragen === 0;
            return (
              <TableRow key={z.id} className={cn(ueberfaellig && "[&>td:first-child]:border-l-2 [&>td:first-child]:border-destructive")}>
                <TableCell className="whitespace-nowrap">
                  <Link href={zielHref(z, ziel)} className="font-mono text-sm tabular text-primary underline-offset-4 hover:underline">
                    {z.auftragsnummer}
                  </Link>
                </TableCell>
                <TableCell className="min-w-[10rem]">
                  <span className="font-medium text-foreground">{z.aktenbezeichnung}</span>
                  <span className="block font-mono text-xs text-muted-foreground">{z.caseNumber}</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">{z.auftraggeberName}</TableCell>
                {!kompakt && <TableCell className="text-muted-foreground">{auftragsartLabel(z.auftragsart)}</TableCell>}
                <TableCell>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusMarke status={z.status} pausiert={pausiert} />
                    <PrioritaetMarke prioritaet={z.prioritaet} />
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <FristMarke faelligAm={z.faelligAm} status={z.status} pausiert={pausiert} jetzt={jetzt} />
                </TableCell>
                {!kompakt && (
                  <TableCell className="whitespace-nowrap">
                    {z.bearbeiterName ?? <span className="text-muted-foreground">nicht zugewiesen</span>}
                  </TableCell>
                )}
                <TableCell>
                  {nichtsOffen ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <div className="space-y-0.5">
                      <Zaehler n={z.fehlendeUnterlagen} einzahl="fehlende Unterlage" mehrzahl="fehlende Unterlagen" tone="blocker" />
                      <Zaehler n={z.ungepruefteDokumente} einzahl="ungeprüftes Dokument" mehrzahl="ungeprüfte Dokumente" tone="info" />
                      <Zaehler n={z.offeneRueckfragen} einzahl="offene Rückfrage" mehrzahl="offene Rückfragen" tone="warnung" />
                    </div>
                  )}
                </TableCell>
                {!kompakt && (
                  <TableCell className="whitespace-nowrap text-xs tabular text-muted-foreground">{datumZeitText(z.updatedAt)}</TableCell>
                )}
                {uebernehmen && (
                  <TableCell className="text-right">
                    {z.bearbeiterId == null ? (
                      <AktionKnopf aktion={uebernehmenAction.bind(null, z.id)} pendingLabel="Übernehme …">
                        Übernehmen
                      </AktionKnopf>
                    ) : null}
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * Kurzliste fuer die Dashboard-Karten: Nummer, Akte, Auftraggeber, Marken.
 */
export function AuftragKurzListe({ zeilen, jetzt, leerText }: { zeilen: AuftragZeile[]; jetzt: Date; leerText: string }) {
  if (zeilen.length === 0) return <p className="text-sm text-muted-foreground">{leerText}</p>;
  return (
    <ul className="divide-y">
      {zeilen.map((z) => {
        const pausiert = z.pausiertSeit != null;
        return (
          <li key={z.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0">
            <div className="min-w-0">
              <Link
                href={`/backoffice/auftraege/${z.id}`}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {z.aktenbezeichnung}
              </Link>
              <div className="text-xs text-muted-foreground">
                <span className="font-mono tabular">{z.auftragsnummer}</span> · {z.auftraggeberName}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusMarke status={z.status} pausiert={pausiert} />
              <FristMarke faelligAm={z.faelligAm} status={z.status} pausiert={pausiert} jetzt={jetzt} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ListenKarte({
  titel,
  beschreibung,
  zeilen,
  jetzt,
  leerText,
  mehrHref,
}: {
  titel: string;
  beschreibung?: string;
  zeilen: AuftragZeile[];
  jetzt: Date;
  leerText: string;
  mehrHref?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle>{titel}</CardTitle>
          {beschreibung && <CardDescription>{beschreibung}</CardDescription>}
        </div>
        {mehrHref && (
          <Link href={mehrHref} className="shrink-0 text-xs text-primary underline-offset-4 hover:underline">
            Alle anzeigen
          </Link>
        )}
      </CardHeader>
      <CardContent>
        <AuftragKurzListe zeilen={zeilen} jetzt={jetzt} leerText={leerText} />
      </CardContent>
    </Card>
  );
}

/** Ruhige Kennzahlkachel. */
export function Kennzahl({ wert, label, hinweis, href, tone = "neutral" }: { wert: string | number; label: string; hinweis?: string; href?: string; tone?: "neutral" | "warnung" | "blocker" | "ok" }) {
  const farbe =
    tone === "blocker" ? "text-destructive" : tone === "warnung" ? "text-[hsl(var(--warning))]" : tone === "ok" ? "text-success" : "text-foreground";
  const inhalt = (
    <>
      <div className={cn("display text-2xl leading-none tabular", farbe)}>{wert}</div>
      <div className="mt-1.5 text-xs font-medium text-foreground">{label}</div>
      {hinweis && <div className="mt-0.5 text-[0.6875rem] text-muted-foreground">{hinweis}</div>}
    </>
  );
  const klasse = "rounded-lg border bg-card p-4 card-elevated";
  return href ? (
    <Link href={href} className={cn(klasse, "block transition-colors hover:bg-accent/40")}>
      {inhalt}
    </Link>
  ) : (
    <div className={klasse}>{inhalt}</div>
  );
}
