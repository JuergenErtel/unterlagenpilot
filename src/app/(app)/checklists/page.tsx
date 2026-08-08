import { CHECKLIST_TEMPLATES } from "@/lib/checklists/templates";
import { PageHeader } from "@/components/ui/page-header";
import { ChecklistRuleTester } from "@/components/checklist/checklist-rule-tester";
import { ChecklistBrowser } from "@/components/checklist/checklist-browser";

export default function ChecklistsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Wissensbasis"
        title="Checklisten"
        subtitle="Welche Unterlagen ein Fall braucht – abhängig von Finanzierungsart, Kundentyp, Objekt und Plattform. Derzeit fest hinterlegt; eigene Regeln folgen."
      />

      <ChecklistRuleTester />

      <ChecklistBrowser templates={CHECKLIST_TEMPLATES} />
    </div>
  );
}
