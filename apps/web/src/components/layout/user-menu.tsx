import { LogIn, LogOut, Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDemo } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { shortAddress } from "@/lib/format";
import { useNameOf } from "@/lib/names";
import { ROLE_ICON, workspacesFor } from "./nav";

export function UserMenu() {
  const { t } = useTranslation();
  const { user, status, demoKey, displayName, signOut } = useAuth();
  const demo = useDemo();
  const nameOf = useNameOf();
  const [, navigate] = useLocation();

  if (status !== "signed-in" || !user) {
    return (
      <Button size="sm" asChild>
        <Link href="/login">
          <LogIn /> <span>{t("nav.signIn")}</span>
        </Link>
      </Button>
    );
  }

  const demoAccount = demo.data?.accounts.find((a) => a.key === demoKey);
  const name = demoAccount?.name ?? nameOf(user.walletAddress)?.name ?? displayName ?? (user.role === "CITIZEN" ? t("roles.CITIZEN") : shortAddress(user.walletAddress));
  const Icon = ROLE_ICON[user.role];
  const initials = name.replace(/[^A-Za-z ]/g, "").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "NS";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-1.5">
          <Avatar className="size-7">
            <AvatarFallback className="bg-foreground text-background font-mono text-[10px] font-medium">{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden max-w-32 truncate text-sm xl:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-normal">
            <Icon className="size-3" /> {t(`roles.${user.role}`)}
            {user.walletAddress && <span className="font-mono"> · {shortAddress(user.walletAddress)}</span>}
          </span>
          {demoAccount && <span className="text-muted-foreground text-xs font-normal">{demoAccount.title}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspacesFor(user.roles).map((w) => (
          <DropdownMenuItem key={w.path} onSelect={() => navigate(w.path)}>
            <w.icon /> {t(w.labelKey)}
          </DropdownMenuItem>
        ))}
        {demo.data?.enabled && (
          <DropdownMenuItem onSelect={() => navigate("/login")}>
            <Repeat /> {t("nav.switchRole")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void signOut().then(() => navigate("/"));
          }}
        >
          <LogOut /> {t("nav.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
