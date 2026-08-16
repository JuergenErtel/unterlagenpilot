"use client";

import { useActionState } from "react";
import { speichereOrganisation, type OrganisationErgebnis } from "@/lib/actions/organisation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SubmitButton } from "@/components/ui/submit-button";

/**
 * Die Angaben, die auf erzeugten Papieren erscheinen.
 *
 * Bewusst EIN Formular und nicht eines je Feld: Wer den Fuß seines
 * Finanzierungszertifikats einrichtet, macht das einmal und vollständig.
 */
export function DokumentangabenForm({
  werte,
  hatUnterschrift,
}: {
  werte: {
    street: string | null;
    zip: string | null;
    city: string | null;
    website: string | null;
    phone: string | null;
    rechtlicherHinweis: string | null;
  };
  hatUnterschrift: boolean;
}) {
  const [ergebnis, action] = useActionState<OrganisationErgebnis | null, FormData>(
    speichereOrganisation,
    null
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Feld id="street" label="Straße und Hausnummer" wert={werte.street} />
        <div className="grid grid-cols-[6rem_1fr] gap-2">
          <Feld id="zip" label="PLZ" wert={werte.zip} />
          <Feld id="city" label="Ort" wert={werte.city} />
        </div>
        <Feld id="website" label="Website" wert={werte.website} platzhalter="www.beispiel.de" />
        <Feld id="phone" label="Telefon" wert={werte.phone} platzhalter="0160/1234567" />
      </div>

      <div className="space-y-1">
        <Label htmlFor="rechtlicherHinweis">Rechtlicher Hinweis für den Dokumentfuß</Label>
        <Textarea
          id="rechtlicherHinweis"
          name="rechtlicherHinweis"
          rows={4}
          defaultValue={werte.rechtlicherHinweis ?? ""}
          placeholder={
            "z. B.: Muster GmbH ist in Deutschland unter der Firmennummer … eingetragen. Jürgen Ertel ist von der Industrie- und Handelskammer … reguliert und zugelassen und ist im Finanzdienstleistungsregister mit der Referenznummer … eingetragen."
          }
        />
        <p className="text-xs text-muted-foreground">
          Wird wörtlich in den Fuß des Finanzierungszertifikats übernommen. Was dort stehen muss –
          Rechtsform, zuständige IHK, Registernummer nach § 34i GewO –, weißt du besser als wir;
          deshalb ein freies Feld statt geratener Einzelfelder.
        </p>
      </div>

      <div className="space-y-1">
        <Label htmlFor="unterschrift">Unterschriftsbild</Label>
        <Input id="unterschrift" name="unterschrift" type="file" accept="image/png,image/jpeg" />
        <p className="text-xs text-muted-foreground">
          {hatUnterschrift
            ? "Eine Unterschrift ist hinterlegt. Eine neue Datei ersetzt sie; ohne Auswahl bleibt sie stehen."
            : "PNG oder JPG, höchstens 2 MB. Erscheint auf dem Finanzierungszertifikat über deinem Namen."}
        </p>
        {hatUnterschrift && (
          <label className="flex items-center gap-2 pt-1 text-sm">
            <input type="checkbox" name="unterschriftEntfernen" value="1" className="h-4 w-4" />
            Hinterlegte Unterschrift entfernen
          </label>
        )}
      </div>

      {ergebnis?.ok === false && (
        <p className="text-sm text-destructive">{ergebnis.fehler}</p>
      )}
      {ergebnis?.ok === true && (
        <p className="text-sm text-success">Gespeichert.</p>
      )}

      <SubmitButton>Speichern</SubmitButton>
    </form>
  );
}

function Feld({
  id,
  label,
  wert,
  platzhalter,
}: {
  id: string;
  label: string;
  wert: string | null;
  platzhalter?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} name={id} defaultValue={wert ?? ""} placeholder={platzhalter} />
    </div>
  );
}
