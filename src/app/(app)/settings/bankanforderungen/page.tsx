import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/auth/context";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { addBankRequirement, deleteBankRequirement } from "@/lib/actions/bank-requirements";
import {
  COMMON_BANKS,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  REQUIREMENT_LEVELS,
  REQUIREMENT_LEVEL_LABELS,
  type DocumentType,
  type RequirementLevel,
} from "@/lib/domain/enums";

export const dynamic = "force-dynamic";

export default async function BankRequirementsSettingsPage() {
  const ctx = await requireContext();
  const requirements = await prisma.bankRequirement.findMany({
    where: { organizationId: ctx.organizationId },
    orderBy: [{ bankName: "asc" }, { title: "asc" }],
  });

  const byBank = new Map<string, typeof requirements>();
  for (const r of requirements) {
    const list = byBank.get(r.bankName) ?? [];
    list.push(r);
    byBank.set(r.bankName, list);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Konfiguration"
        title="Bankanforderungen"
        subtitle="Zusätzliche Unterlagen je Bank pflegen. Sie erscheinen automatisch in der Checkliste jedes Falls mit dieser Bank."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings"><ArrowLeft />Zurück</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Neue Anforderung</CardTitle>
          <CardDescription>Bank, Bezeichnung und (optional) erwarteter Dokumenttyp.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addBankRequirement} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="bankName">Bank</Label>
              <Input id="bankName" name="bankName" list="banks" placeholder="z. B. ING" required />
              <datalist id="banks">
                {COMMON_BANKS.map((b) => (<option key={b} value={b} />))}
              </datalist>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="title">Bezeichnung</Label>
              <Input id="title" name="title" placeholder="z. B. Kontoauszüge 3 Monate" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="documentType">Dokumenttyp (optional)</Label>
              <select id="documentType" name="documentType" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">– keiner –</option>
                {DOCUMENT_TYPES.map((t) => (<option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t as DocumentType]}</option>))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="level">Priorität</Label>
              <div className="flex gap-2">
                <select id="level" name="level" defaultValue="bankabhaengig" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  {REQUIREMENT_LEVELS.map((l) => (<option key={l} value={l}>{REQUIREMENT_LEVEL_LABELS[l as RequirementLevel]}</option>))}
                </select>
                <SubmitButton size="sm" pendingLabel="…">Hinzufügen</SubmitButton>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {byBank.size === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Noch keine eigenen Bankanforderungen. Legen Sie oben die erste an.
          </CardContent>
        </Card>
      ) : (
        [...byBank.entries()].map(([bank, reqs]) => (
          <Card key={bank}>
            <CardHeader className="pb-3"><CardTitle className="text-base">{bank}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {reqs.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                  <div>
                    <div className="font-medium">{r.title}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="neutral">{REQUIREMENT_LEVEL_LABELS[r.level as RequirementLevel]}</Badge>
                      {r.documentType && <span>{DOCUMENT_TYPE_LABELS[r.documentType as DocumentType]}</span>}
                    </div>
                  </div>
                  <form action={deleteBankRequirement.bind(null, r.id)}>
                    <button type="submit" aria-label="Löschen" className="rounded p-1 text-muted-foreground hover:bg-muted">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
