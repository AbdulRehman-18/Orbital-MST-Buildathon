import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ROLE_HOME, useAuth, type Role } from "@/lib/auth";

/** Renders children only for signed-in users holding `role`; otherwise a sign-in / redirect card. */
export function RoleGate({ role, children }: { role: Role; children: ReactNode }) {
  const { t } = useTranslation();
  const { status, user } = useAuth();

  if (status === "loading") return <Skeleton className="mx-auto h-64 w-full max-w-5xl" />;
  if (user && user.roles.includes(role)) return <>{children}</>;

  const home = user ? ROLE_HOME[user.role] : undefined;
  return (
    <Card className="mx-auto mt-8 max-w-lg text-center">
      <CardHeader className="items-center">
        <div className="bg-primary/10 text-primary mx-auto mb-2 flex size-12 items-center justify-center rounded-full">
          <Lock className="size-6" />
        </div>
        <CardTitle>{t("gate.title")}</CardTitle>
        <CardDescription>
          {user
            ? t("gate.wrongRole", { current: t(`roles.${user.role}`), role: t(`roles.${role}`) })
            : t("gate.body", { role: t(`roles.${role}`) })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href={`/login?next=${encodeURIComponent(window.location.pathname)}`}>{user ? t("nav.switchRole") : t("gate.goLogin")}</Link>
        </Button>
        {home && (
          <Button variant="outline" asChild>
            <Link href={home}>{t("gate.goHome")}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
