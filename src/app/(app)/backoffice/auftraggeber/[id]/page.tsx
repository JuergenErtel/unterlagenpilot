import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen } from "@/lib/backoffice/auftraege";
import { berechneKontingent, vorperiode, type KontingentEreignisRoh } from "@/lib/backoffice/kontingent";
import { periodeVon } from "@/lib/backoffice/sla";
import { datumZeitText } from "@/lib/backoffice/anzeige";
import { AuftragsListe } from "@/components/backoffice/auftrags-liste";
import { AuftraggeberForm, KontaktDeaktivieren, KontaktForm, KontingentKorrekturForm, VerknuepfungForm } from "@/components/backoffice/auftraggeber-formulare";
import { BACKOFFICE_ABRECHNUNGSMODELL_LABELS, type BackofficeAbrechnungsmodell } from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

export default async function AuftraggeberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const periode = periodeVon(jetzt);
  const manager = ctx.backofficeRolle === "manager";

  const ag = await prisma.backofficeAuftraggeber.findFirst({
    where: { id, backofficeOrganizationId: ctx.organizationId },
    include: {
      organization: { select: { name: true, slug: true } },
      kontakte: { orderBy: [{ aktiv: "desc" }, { name: "asc" }], include: { user: { select: { email: true } } } },
      kontingentEreignisse: { where: { periode: { in: [periode, vorperiode(periode)] } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!ag) notFound();

  const auftraege = await ladeAuftragZeilen({ auftraggeberId: ag.id, backofficeOrganizationId: ctx.organizationId });
  const stand = berechneKontingent({
    periode,
    modell: ag.abrechnungsmodell as BackofficeAbrechnungsmodell,
    kontingentMonatlich: ag.kontingentMonatlich,
    carryOverMax: ag.carryOverMax,
    ereignisse: ag.kontingentEreignisse as KontingentEreignisRoh[],
  });
  const intern = ag.abrechnungsmodell === "intern";

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Auftraggeber"
        title={ag.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant="neutral">{BACKOFFICE_ABRECHNUNGSMODELL_LABELS[ag.abrechnungsmodell as BackofficeAbrechnungsmodell]}</Badge>
            {ag.organization ? <Badge variant="success">Portal: {ag.organization.name}</Badge> : <Badge variant="outline">Kein Portalzugang</Badge>}
            {!ag.aktiv && <Badge variant="destructive">inaktiv</Badge>}
          </span>
        }
        actions={<Button asChild variant="outline" size="sm"><Link href="/backoffice/auftraggeber"><ArrowLeft /> Alle Auftraggeber</Link></Button>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Aufträge</CardTitle></CardHeader>
            <CardContent className="p-0">
              <AuftragsListe zeilen={auftraege} jetzt={jetzt} kompakt leerText="Noch kein Auftrag für diesen Auftraggeber." />
            </CardContent>
          </Card>

          {manager && !intern && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Stammdaten</CardTitle></CardHeader>
              <CardContent>
                <AuftraggeberForm
                  werte={{
                    id: ag.id,
                    name: ag.name,
                    kurzname: ag.kurzname,
                    street: ag.street,
                    zip: ag.zip,
                    city: ag.city,
                    email: ag.email,
                    phone: ag.phone,
                    abrechnungsmodell: ag.abrechnungsmodell as BackofficeAbrechnungsmodell,
                    kontingentMonatlich: ag.kontingentMonatlich,
                    carryOverMax: ag.carryOverMax,
                    slaTage: ag.slaTage,
                    antragstellerKontaktErlaubt: ag.antragstellerKontaktErlaubt,
                    aktiv: ag.aktiv,
                    notizIntern: ag.notizIntern,
                  }}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Ansprechpartner</CardTitle>
              <CardDescription>Kontakte beim Auftraggeber. Mit E-Mail eines Nutzers der verknüpften Organisation werden sie zu Portal-Nutzern.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {ag.kontakte.length === 0 ? (
                <p className="text-sm text-muted-foreground">Noch kein Kontakt.</p>
              ) : (
                <ul className="divide-y">
                  {ag.kontakte.map((k) => (
                    <li key={k.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span>
                        <span className={k.aktiv ? "font-medium" : "text-muted-foreground line-through"}>{k.name}</span>
                        {k.email && <span className="ml-2 text-xs text-muted-foreground">{k.email}</span>}
                        {k.phone && <span className="ml-2 text-xs text-muted-foreground">{k.phone}</span>}
                      </span>
                      <span className="flex items-center gap-2">
                        {k.userId ? <Badge variant="success">Portal-Nutzer</Badge> : <Badge variant="neutral">ohne Portal</Badge>}
                        {k.darfAlleAuftraegeSehen ? <Badge variant="outline">alle Aufträge</Badge> : <Badge variant="outline">nur eigene</Badge>}
                        {manager && k.aktiv && <KontaktDeaktivieren auftraggeberId={ag.id} kontaktId={k.id} />}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {manager && <KontaktForm auftraggeberId={ag.id} verknuepft={Boolean(ag.organizationId)} />}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {!intern && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Portal-Verknüpfung</CardTitle>
                <CardDescription>Nutzer dieser BaufiDesk-Organisation sehen danach die Aufträge dieses Auftraggebers im Auftraggeberportal – und nur diese.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>{ag.organization ? <>Verknüpft mit <span className="font-medium">{ag.organization.name}</span> (<span className="font-mono">{ag.organization.slug}</span>)</> : "Nicht verknüpft."}</div>
                {manager && <VerknuepfungForm id={ag.id} aktuellerSlug={ag.organization?.slug ?? null} />}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Kontingent {periode}</CardTitle>
              <CardDescription>Verbrauch entsteht bei der Übergabe eines Auftrags.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {intern ? (
                <p className="text-muted-foreground">Interne Übergaben aus dem eigenen Vertrieb verbrauchen kein Kontingent.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Kachel label="Enthalten" wert={stand.enthalten == null ? "—" : String(stand.enthalten)} />
                    <Kachel label="Übertrag" wert={String(stand.uebertrag)} />
                    <Kachel label="Verbraucht" wert={String(stand.verbraucht)} />
                    <Kachel label="Frei" wert={stand.frei == null ? "—" : String(stand.frei)} />
                    <Kachel label="Zusatzfälle" wert={String(stand.zusatzfaelle)} />
                    <Kachel label="Überzogen" wert={String(stand.ueberzogen)} />
                  </div>
                  {ag.kontingentEreignisse.length > 0 && (
                    <ul className="space-y-1 border-t pt-2 text-xs">
                      {ag.kontingentEreignisse.map((e) => (
                        <li key={e.id} className="flex justify-between gap-2">
                          <span className="text-muted-foreground">{datumZeitText(e.createdAt)} · {e.periode}</span>
                          <span>{e.art} {e.menge > 0 ? `+${e.menge}` : e.menge}{e.begruendung ? ` – ${e.begruendung}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {manager && <KontingentKorrekturForm auftraggeberId={ag.id} periode={periode} />}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kachel({ label, wert }: { label: string; wert: string }) {
  return (
    <div className="rounded-md border px-3 py-2">
      <div className="display text-lg leading-none tabular">{wert}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
