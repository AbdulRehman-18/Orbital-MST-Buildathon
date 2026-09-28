import { Construction } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { NavItem } from "@/components/layout/nav";

export default function PlaceholderPage({ item }: { item: NavItem }) {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <h1 className="flex items-center gap-3 text-2xl font-semibold">
        <item.icon className="text-primary size-6" />
        {t(item.labelKey)}
      </h1>
      <Alert>
        <Construction />
        <AlertTitle>{t("common.comingSoon")}</AlertTitle>
        <AlertDescription>{t("placeholder.body", { phase: `Phase ${item.phase}` })}</AlertDescription>
      </Alert>
    </div>
  );
}
