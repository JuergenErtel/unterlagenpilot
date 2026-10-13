import { prisma } from "@/lib/db";
import { DEFAULT_TEMPLATES, templateKey } from "@/lib/messages/render";
import { getBrokerInfo } from "@/lib/organization/broker-info";
import { renderSmsNachfass } from "@/lib/kontakt/sms-nachfass";

/**
 * Der fertige SMS-Text für die Fallseite: Vorlage der Organisation vor
 * Standardvorlage (wie beim Erstkontakt), Name des eingeloggten Beraters,
 * Website aus den Organisationsdaten. Die Website steht bewusst nicht fest im
 * Text – beim zweiten Vermittler stünde sonst Jürgens Domain in der SMS.
 */
export async function ladeSmsNachfassText(a: {
  organizationId: string;
  userName: string;
  applicant: { anrede: string | null; vorname: string | null; nachname: string | null } | null;
  property: { city: string | null; zip: string | null } | null;
}): Promise<string> {
  const [broker, override] = await Promise.all([
    getBrokerInfo(a.organizationId),
    prisma.messageTemplate.findFirst({
      where: { organizationId: a.organizationId, type: "nicht_erreicht", channel: "sms" },
      select: { body: true },
    }),
  ]);
  const body = override?.body ?? DEFAULT_TEMPLATES[templateKey("nicht_erreicht", "sms")]!.body;
  return renderSmsNachfass(body, {
    anrede: a.applicant?.anrede,
    vorname: a.applicant?.vorname,
    nachname: a.applicant?.nachname,
    ort: a.property?.city,
    plz: a.property?.zip,
    beraterName: a.userName || broker.name,
    website: broker.website,
  });
}
