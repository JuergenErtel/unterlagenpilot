"use client";

import { useEffect, useState } from "react";
import { Tabs } from "@/components/ui/tabs";

/**
 * Fall-Cockpit-Tabs, per URL steuerbar.
 *
 * `tabParam` kommt serverseitig aus `?tab=` (z.B. Roadmap-Button „Selbst hochladen"
 * → `?tab=dokumente#broker-upload`). Bei Soft-Navigation aktualisiert der Effekt den
 * aktiven Tab; anschliessend wird zum Hash-Ziel gescrollt (Formular ist erst nach
 * Tab-Wechsel im DOM, daher explizit statt via nativem Anker-Sprung).
 */
export function CaseTabs({
  defaultValue,
  tabParam,
  children,
}: {
  defaultValue: string;
  tabParam?: string;
  children: React.ReactNode;
}) {
  const [value, setValue] = useState(tabParam ?? defaultValue);

  useEffect(() => {
    if (tabParam && tabParam !== value) setValue(tabParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam]);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [value]);

  return (
    <Tabs value={value} onValueChange={setValue}>
      {children}
    </Tabs>
  );
}
