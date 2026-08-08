"use server";

import { revalidatePath } from "next/cache";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/auth/platform-admin";
import { gibFrei, lehneAb } from "@/lib/auth/freigabe";
import { isEmailConfigured, sendEmail } from "@/lib/email/resend";
import { mailWillkommen } from "@/lib/email/auth-mails";
import { PLAN_DEFINITIONS } from "@/lib/saas/plans";
import { PLAN_TIERS, type PlanTier } from "@/lib/domain/enums";

export async function freigebenAction(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();

  const requestId = String(formData.get("requestId") ?? "");
  const tier = String(formData.get("tier") ?? "") as PlanTier;
  if (!requestId || !PLAN_TIERS.includes(tier)) return;

  const tageRoh = Number(formData.get("testTage") ?? 30);
  const tage = Number.isFinite(tageRoh) && tageRoh > 0 ? Math.min(tageRoh, 365) : 30;
  const testEndeAm = new Date(Date.now() + tage * 86_400_000);

  const ergebnis = await gibFrei(requestId, { tier, testEndeAm, adminUserId: admin.userId });
  if (!ergebnis.ok) {
    // Der Grund landet als Vermerk am Antrag, damit die Liste ihn anzeigen kann.
    await prisma.signupRequest.updateMany({
      where: { id: requestId },
      data: { ablehnungsgrund: `Freigabe fehlgeschlagen: ${ergebnis.grund}` },
    });
    revalidatePath("/admin/anmeldungen");
    return;
  }

  // Freigabe ist geglueckt: ein Vermerk aus einem frueheren, gescheiterten
  // Versuch gilt nicht mehr. Ohne diesen Reset wuerde die Liste "Zuletzt
  // entschieden" dauerhaft vor einem Problem warnen, das laengst behoben ist.
  await prisma.signupRequest.update({
    where: { id: requestId },
    data: { ablehnungsgrund: null },
  });

  // NACH der Transaktion: scheitert der Versand, bleibt der Zugang gueltig.
  const antrag = await prisma.signupRequest.findUnique({ where: { id: requestId } });
  if (antrag && isEmailConfigured()) {
    const mail = mailWillkommen({
      name: antrag.name,
      organisation: antrag.firmenname,
      tarif: PLAN_DEFINITIONS[tier].name,
      testEndeAm,
      loginUrl: `${getEnv().APP_BASE_URL.replace(/\/$/, "")}/login`,
    });
    try {
      await sendEmail({ to: antrag.email, subject: mail.subject, text: mail.text, empfaenger: "intern" });
    } catch (e) {
      console.error("[freigabe] Willkommensmail fehlgeschlagen:", e);
      // `ablehnungsgrund` ist hier zweckentfremdet: Nach einer geglueckten
      // Freigabe ist es kein Ablehnungsgrund mehr, sondern der einzige Ort,
      // an dem die Liste "Zuletzt entschieden" einen Betreiber-Hinweis
      // anzeigen kann (siehe page.tsx).
      await prisma.signupRequest.update({
        where: { id: requestId },
        data: { ablehnungsgrund: "Zugang aktiv, aber Willkommensmail nicht zustellbar." },
      });
    }
  }

  revalidatePath("/admin/anmeldungen");
}

export async function ablehnenAction(formData: FormData): Promise<void> {
  const admin = await requirePlatformAdmin();
  const requestId = String(formData.get("requestId") ?? "");
  const grund = String(formData.get("grund") ?? "").trim() || "ohne Angabe";
  if (!requestId) return;
  await lehneAb(requestId, grund, admin.userId);
  revalidatePath("/admin/anmeldungen");
}
