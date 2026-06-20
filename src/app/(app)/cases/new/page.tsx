import { createCase } from "@/lib/actions/cases";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FINANCING_TYPES,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
} from "@/lib/domain/enums";

export default function NewCasePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Neuer Fall</h1>
        <p className="text-sm text-muted-foreground">
          Lege einen Fall manuell an (z. B. aus E-Mail/WhatsApp). Du kannst danach Dokumente hochladen oder einen Upload-Link erstellen.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Grunddaten</CardTitle>
          <CardDescription>Weitere Angaben ergänzt du später in der Fallakte oder über das Kundenformular.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createCase} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="vorname">Vorname Antragsteller 1</Label>
                <Input id="vorname" name="vorname" placeholder="Max" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nachname">Nachname</Label>
                <Input id="nachname" name="nachname" placeholder="Mustermann" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="financingType">Finanzierungsart</Label>
                <select id="financingType" name="financingType" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">– bitte wählen –</option>
                  {FINANCING_TYPES.map((f) => (<option key={f} value={f}>{f}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="employmentType">Kundentyp</Label>
                <select id="employmentType" name="employmentType" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">– bitte wählen –</option>
                  {EMPLOYMENT_TYPES.map((e) => (<option key={e} value={e}>{EMPLOYMENT_TYPE_LABELS[e]}</option>))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="propertyType">Objektart</Label>
                <select id="propertyType" name="propertyType" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option value="">– bitte wählen –</option>
                  {PROPERTY_TYPES.map((p) => (<option key={p} value={p}>{PROPERTY_TYPE_LABELS[p]}</option>))}
                </select>
              </div>
              <div className="flex items-end gap-2 pb-2">
                <input type="checkbox" id="kapitalanlage" name="kapitalanlage" className="h-4 w-4" />
                <Label htmlFor="kapitalanlage">Kapitalanlage</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="submit">Fall anlegen</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
