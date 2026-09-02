import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusMarke } from "@/components/backoffice/status-anzeigen";
import { auftragsartLabel } from "@/lib/backoffice/leistungen";
import { datumText } from "@/lib/backoffice/anzeige";
import type { AuftragZeile } from "@/lib/backoffice/auftraege";
import { fehltText } from "./hilfen";

/**
 * Auftragsliste des Auftraggebers. Zeigt nur, was den Auftraggeber angeht:
 * keine Bearbeiter, keine Prioritaet, keine interne Frist-Bewertung - nur die
 * zugesagte Frist als Datum.
 */
export function AuftragsTabelle({ zeilen, leerText }: { zeilen: AuftragZeile[]; leerText?: string }) {
  if (zeilen.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {leerText ?? "Keine Aufträge in dieser Ansicht."}
      </p>
    );
  }
  return (
    <>
      {/* Mobil: eine Karte je Auftrag - Status, Frist und was fehlt, ohne
          Querscrollen. Ab md die Tabelle. */}
      <ul className="space-y-2 md:hidden">
        {zeilen.map((z) => (
          <li key={z.id} className="flaeche-blatt p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/portal/auftraege/${z.id}`} className="block truncate font-medium text-foreground underline-offset-4 hover:underline">{z.aktenbezeichnung ?? auftragsartLabel(z.auftragsart)}</Link>
                <div className="font-mono text-xs tabular text-muted-foreground">{z.auftragsnummer} · {auftragsartLabel(z.auftragsart)}</div>
              </div>
              <StatusMarke status={z.status} pausiert={Boolean(z.pausiertSeit)} portal />
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <div><dt className="inline">Frist </dt><dd className="inline tabular text-foreground">{datumText(z.faelligAm)}</dd></div>
              {z.fehlendeUnterlagen > 0 && <div className="text-[hsl(var(--warning))]">{fehltText(z.fehlendeUnterlagen)}</div>}
              {z.offeneRueckfragen > 0 && <div className="font-medium text-[hsl(var(--warning))]">{z.offeneRueckfragen} {z.offeneRueckfragen === 1 ? "Rückfrage" : "Rückfragen"} offen</div>}
            </dl>
          </li>
        ))}
      </ul>
    <div className="scroll-x hidden rounded-lg border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Auftrag</TableHead>
            <TableHead>Akte</TableHead>
            <TableHead>Auftragsart</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Zugesagte Frist</TableHead>
            <TableHead>Eingang</TableHead>
            <TableHead>Fehlt</TableHead>
            <TableHead className="text-right">Rückfragen</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {zeilen.map((z) => (
            <TableRow key={z.id}>
              <TableCell className="whitespace-nowrap">
                <Link href={`/portal/auftraege/${z.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                  {z.auftragsnummer}
                </Link>
              </TableCell>
              <TableCell className="max-w-[16rem] truncate">{z.aktenbezeichnung ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{auftragsartLabel(z.auftragsart)}</TableCell>
              <TableCell>
                <StatusMarke status={z.status} pausiert={Boolean(z.pausiertSeit)} portal />
              </TableCell>
              <TableCell className="tabular whitespace-nowrap">{datumText(z.faelligAm)}</TableCell>
              <TableCell className="tabular whitespace-nowrap">{datumText(z.eingangAm)}</TableCell>
              <TableCell className={z.fehlendeUnterlagen > 0 ? "whitespace-nowrap text-[hsl(var(--warning))]" : "text-muted-foreground"}>
                {fehltText(z.fehlendeUnterlagen)}
              </TableCell>
              <TableCell className={`tabular text-right ${z.offeneRueckfragen > 0 ? "font-medium text-[hsl(var(--warning))]" : "text-muted-foreground"}`}>
                {z.offeneRueckfragen > 0 ? `${z.offeneRueckfragen} offen` : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
    </>
  );
}
