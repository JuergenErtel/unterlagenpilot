import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuftragsListe } from "@/components/backoffice/auftrags-liste";
import { prisma } from "@/lib/db";
import { auftraegeFilterFuer, requireBackoffice } from "@/lib/backoffice/zugriff";
import { ladeAuftragZeilen } from "@/lib/backoffice/auftraege";
import { sortiereQueue } from "@/lib/backoffice/queue";

export const dynamic = "force-dynamic";

export default async function UebergabePage() {
  const ctx = await requireBackoffice();
  const jetzt = new Date();
  const filter = auftraegeFilterFuer(ctx);
  const [zeilen, ohneAbnahme] = await Promise.all([
    ladeAuftragZeilen(filter),
    prisma.backofficeAuftrag.findMany({
      where: { ...filter, status: "uebergeben", abgenommenAm: null },
      select: { id: true },
    }),
  ]);
  const ohneAbnahmeIds = new Set(ohneAbnahme.map((a) => a.id));
  const bereit = sortiereQueue(zeilen.filter((z) => z.status === "einreichungsfertig"), jetzt);
  const wartetAbnahme = zeilen
    .filter((z) => z.status === "uebergeben" && ohneAbnahmeIds.has(z.id))
    .sort((a, b) => (a.uebergebenAm?.getTime() ?? 0) - (b.uebergebenAm?.getTime() ?? 0));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Mein Arbeitstag"
        title="Übergabe"
        subtitle="Freigegebene Aufträge, die an den Auftraggeber übergeben werden können - und übergebene, deren Abnahme noch aussteht."
      />
      <Card>
        <CardHeader>
          <CardTitle>Übergabebereit</CardTitle>
          <CardDescription>
            {bereit.length} {bereit.length === 1 ? "Auftrag" : "Aufträge"} mit Qualitätsfreigabe. Die Übergabe wird im Auftrag bestätigt.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <AuftragsListe zeilen={bereit} jetzt={jetzt} leerText="Nichts ist übergabebereit." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Wartet auf Abnahme</CardTitle>
          <CardDescription>
            {wartetAbnahme.length} {wartetAbnahme.length === 1 ? "Auftrag" : "Aufträge"} übergeben, vom Auftraggeber noch nicht abgenommen.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <AuftragsListe zeilen={wartetAbnahme} jetzt={jetzt} leerText="Alle übergebenen Aufträge sind abgenommen." />
        </CardContent>
      </Card>
    </div>
  );
}
