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
        subtitle="Im MVP fix hinterlegt, später pro Organisation editierbar."
      />

      <ChecklistRuleTester />

      <ChecklistBrowser templates={CHECKLIST_TEMPLATES} />
    </div>
  );
}
