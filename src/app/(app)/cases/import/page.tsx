import Link from "next/link";
import { Import, Plus, Info } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export default async function CaseImportPage() {
  const ctx = await requireContext();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Aus FinLink importieren</h1>
        <p className="text-sm text-muted-foreground">
          Übernahme bestehender Vorgänge aus FinLink für {ctx.organizationName}.
        </p>
      </div>

      <Card>
        <CardContent className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <p>
            Der FinLink-Import ist über den <code>FinLinkConnector</code>{" "}
            vorbereitet (Base URL und API-Key sind konfigurierbar). Im MVP ist
            die Funktion ein <strong>Stub</strong> – es findet noch keine echte
            Datenübernahme statt. Alternativ kann ein Fall manuell angelegt
            werden.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Import className="h-5 w-5 text-muted-foreground" />
                FinLink-Vorgang importieren
              </CardTitle>
              <Badge variant="warning">Stub</Badge>
            </div>
            <CardDescription>
              Geben Sie die FinLink-Vorgangs-ID an, um den Import vorzubereiten.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="finlinkId">FinLink-Vorgangs-ID</Label>
              <Input
                id="finlinkId"
                name="finlinkId"
                placeholder="z. B. FL-2026-004711"
                disabled
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Eingabe im MVP deaktiviert. Die Anbindung erfolgt nach Freigabe der
              FinLink-API.
            </p>
          </CardContent>
          <CardFooter>
            <Button variant="outline" disabled>
              <Import className="h-4 w-4" />
              Import vorbereiten (Stub)
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-muted-foreground" />
              Fall manuell anlegen
            </CardTitle>
            <CardDescription>
              Solange der Import nicht aktiv ist, legen Sie den Fall direkt an.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Erfassen Sie Antragsteller, Objekt und Finanzierungsart manuell und
            starten Sie anschließend Upload und KI-Auswertung.
          </CardContent>
          <CardFooter>
            <Button asChild>
              <Link href="/cases/new">
                <Plus className="h-4 w-4" />
                Neuen Fall anlegen
              </Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
