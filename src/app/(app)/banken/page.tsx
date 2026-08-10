import Link from "next/link";
import { Landmark } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { sucheBanken } from "@/lib/banken/abfrage";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function BankenPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireContext();
  const { q } = await searchParams;
  const treffer = await sucheBanken(q ?? "");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Wissensbasis"
        title="Banken-Wiki"
        subtitle="Finanzierungskriterien der Kreditinstitute – nachschlagen, bevor du einreichst."
      />

      <Card>
        <CardContent className="pt-6">
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="flex-1 text-sm">
              <span className="mb-1 block text-muted-foreground">Bank suchen</span>
              <Input name="q" defaultValue={q ?? ""} placeholder="z. B. Sparkasse, ING, muenchen" />
            </label>
            <button type="submit" className="feld h-9 px-4 text-sm">
              Suchen
            </button>
          </form>
        </CardContent>
      </Card>

      {treffer.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Keine Bank gefunden. Umlaute lassen sich auch als „ae“, „oe“, „ue“ schreiben.
        </p>
      ) : (
        <div className="space-y-2">
          {treffer.map((b) => (
            <Link key={b.bankId} href={`/banken/${encodeURIComponent(b.bankId)}`} className="block">
              <Card className="transition-colors hover:border-primary/40">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <Landmark className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="text-sm font-medium">{b.name}</span>
                  </div>
                  {b.urteile > 0 && <Badge variant="neutral">{b.urteile} Einschränkungen</Badge>}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
