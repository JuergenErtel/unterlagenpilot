import { BrokerUploadForm, type BrokerUploadApplicant } from "@/components/case/broker-upload-form";
import { AndereWege } from "@/components/eingang/andere-wege";

/**
 * Die drei Wege, auf denen Unterlagen in die Akte kommen.
 *
 * Der Anlass: Juergen bekommt die Unterlagen vom Kunden fast nie als Datei am
 * Rechner, sondern per WhatsApp aufs Handy oder per Mail ins Postfach. Beide
 * Wege gab es (Kurzbefehl) oder gibt es neu (Mail-Eingang) - aber an der
 * Stelle, an der man ans Hochladen denkt, stand nur das Dateifeld. Wer den
 * anderen Weg nicht kennt, laedt herunter und wieder hoch.
 *
 * Die beiden Nebenwege stehen in `AndereWege` und werden vom Sortierer
 * mitbenutzt - eine zweite Kopie waere genau die Dopplung, bei der eine
 * Haelfte spaeter stehenbleibt.
 */
export function DokumenteWege({
  caseId,
  maxMb,
  applicants,
  geraetVerbunden,
  wartendImPosteingang,
  mailAdresse,
}: {
  caseId: string;
  maxMb: number;
  applicants: BrokerUploadApplicant[];
  geraetVerbunden: boolean;
  wartendImPosteingang: number;
  mailAdresse: string | null;
}) {
  return (
    <div className="space-y-4">
      <BrokerUploadForm caseId={caseId} maxMb={maxMb} applicants={applicants} />
      <AndereWege
        geraetVerbunden={geraetVerbunden}
        wartendImPosteingang={wartendImPosteingang}
        mailAdresse={mailAdresse}
      />
    </div>
  );
}
