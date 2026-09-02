import { prisma } from "@/lib/db";
import { requirePortal, portalAuftraegeFilter } from "@/lib/backoffice/zugriff";
import { berechneKontingent, vorperiode, type KontingentEreignisRoh } from "@/lib/backoffice/kontingent";
import { periodeVon } from "@/lib/backoffice/sla";
import { BACKOFFICE_ABRECHNUNGSMODELL_LABELS, type BackofficeAbrechnungsmodell } from "@/lib/domain/enums";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

function periodeText(periode: string): string {
  const [j, m] = periode.split("-");
  const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const idx = parseInt(m ?? "", 10) - 1;
  return idx >= 0 && idx < 12 ? `${monate[idx]} ${j}` : periode;
}

function Wert({ label, wert, betont }: { label: string; wert: string; betont?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className={`display mt-1 text-2xl tabular ${betont ? "text-foreground" : "text-foreground/80"}`}>{wert}</dd>
    </div>
  );
}

export default async function PortalKontingent() {
  const ctx = await requirePortal();
  const jetzt = new Date();
  const periode = periodeVon(jetzt);
  const vor = vorperiode(periode);
  const ids = ctx.auftraggeber.map((a) => a.id);

  const [ereignisse, uebergeben] = await Promise.all([
    prisma.backofficeKontingentEreignis.findMany({
      where: { auftraggeberId: { in: ids }, periode: { in: [periode, vor] } },
      select: { auftraggeberId: true, art: true, menge: true, periode: true },
    }),
    prisma.backofficeAuftrag.findMany({
      where: {
        AND: [portalAuftraegeFilter(ctx), { uebergebenAm: { gte: new Date(jetzt.getFullYear(), jetzt.getMonth() - 1, 1) } }],
      },
      select: { auftraggeberId: true, uebergebenAm: true },
    }),
  ]);

  const staende = ctx.auftraggeber.map((a) => {
    const eigene: KontingentEreignisRoh[] = ereignisse
      .filter((e) => e.auftraggeberId === a.id)
      .map((e) => ({ art: e.art, menge: e.menge, periode: e.periode }));
    const modell = a.abrechnungsmodell as BackofficeAbrechnungsmodell;
    const stand = berechneKontingent({
      periode,
      modell,
      kontingentMonatlich: a.kontingentMonatlich,
      carryOverMax: a.carryOverMax,
      ereignisse: eigene,
    });
    const uebergebenPeriode = uebergeben.filter((u) => u.auftraggeberId === a.id && u.uebergebenAm && periodeVon(u.uebergebenAm) === periode).length;
    return { a, modell, stand, uebergebenPeriode };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Auftraggeberportal"
        title="Kontingent"
        subtitle={`Stand ${periodeText(periode)}. Ein Fall zählt mit der Übergabe des Ergebnisses – nicht mit der Beauftragung.`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {staende.map(({ a, modell, stand, uebergebenPeriode }) => (
          <Card key={a.id}>
            <CardHeader>
              <CardTitle>{a.backofficeName}</CardTitle>
              <CardDescription>{BACKOFFICE_ABRECHNUNGSMODELL_LABELS[modell] ?? modell}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {stand.enthalten != null ? (
                  <>
                    <Wert label="Enthalten" wert={String(stand.enthalten)} />
                    <Wert label="Übertrag" wert={String(stand.uebertrag)} />
                    <Wert label="Verbraucht" wert={String(stand.verbraucht)} betont />
                    <Wert label="Noch frei" wert={String(stand.frei ?? 0)} betont />
                    {stand.ueberzogen > 0 ? <Wert label="Über Kontingent" wert={String(stand.ueberzogen)} betont /> : null}
                    <Wert label="Zusatzfälle" wert={String(stand.zusatzfaelle)} />
                  </>
                ) : (
                  <>
                    <Wert label="Verbraucht" wert={String(stand.verbraucht)} betont />
                    <Wert label="Zusatzfälle" wert={String(stand.zusatzfaelle)} />
                  </>
                )}
                <Wert label="Übergebene Aufträge" wert={String(uebergebenPeriode)} />
              </dl>
              {stand.enthalten == null ? (
                <p className="mt-4 text-xs text-muted-foreground">Für dieses Modell gibt es kein monatliches Kontingent; jeder übergebene Fall wird einzeln geführt.</p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">Abrechnung erfolgt durch Ihren Backoffice-Partner.</p>
    </div>
  );
}
