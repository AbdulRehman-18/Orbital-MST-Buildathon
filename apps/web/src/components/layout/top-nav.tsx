import { Menu } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { LanguageSwitcher } from "./language-switcher";
import { PUBLIC_NAV, workspacesFor, type NavItem } from "./nav";
import { UserMenu } from "./user-menu";

function isActive(location: string, path: string) {
  return path === "/" ? location === "/" : location.startsWith(path);
}

/**
 * Hairline header: a blurred white bar with a 1px rule. Public links sit in the middle; a signed-in
 * user's own workspace(s) are appended so each role gets exactly one entry.
 */
export function TopNav() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const workspaces = user ? workspacesFor(user.roles) : [];
  const items: NavItem[] = [...PUBLIC_NAV.filter((n) => n.path !== "/"), ...workspaces];
  // Signed-in users get no site menu: their panel's tabs are the navigation (public pages stay in the footer).
  const bare = !!user && user.role !== "PUBLIC";

  return (
    <header
      className={cn(
        "bg-background/85 sticky top-0 z-40 border-b px-4 backdrop-blur-xl transition-shadow sm:px-6",
        scrolled && "shadow-[0_1px_0_var(--border)]",
      )}
    >
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label={t("brand.name")}>
          <LogoMark className="size-7" />
          <span className="text-[15px] font-semibold tracking-tight">{t("brand.name")}</span>
        </Link>

        {bare ? (
          <span />
        ) : (
          <nav
            aria-label={t("nav.public")}
            className="hidden h-full min-w-0 items-center gap-6 lg:flex"
          >
            {items.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                aria-current={isActive(location, item.path) ? "page" : undefined}
                className={cn(
                  "relative flex h-full items-center text-[13px] whitespace-nowrap transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-foreground after:opacity-0 after:transition-opacity",
                  isActive(location, item.path)
                    ? "text-foreground after:opacity-100"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t(item.labelKey)}
              </Link>
            ))}
          </nav>
        )}

        <div className="flex items-center gap-1 sm:gap-2 lg:justify-self-end">
          <LanguageSwitcher />
          <UserMenu />
          {!bare && (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="lg:hidden"
                  aria-label={t("nav.menu")}
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <LogoMark className="size-7" /> {t("brand.name")}
                  </SheetTitle>
                </SheetHeader>
                <nav className="flex flex-col gap-1 px-4" aria-label={t("nav.public")}>
                  {[...PUBLIC_NAV, ...workspaces].map((item) => (
                    <Link
                      key={item.path}
                      href={item.path}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2.5 text-sm font-medium",
                        isActive(location, item.path)
                          ? "bg-foreground text-background"
                          : "hover:bg-muted",
                      )}
                    >
                      <item.icon className="size-4" /> {t(item.labelKey)}
                    </Link>
                  ))}
                </nav>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </div>
    </header>
  );
}
