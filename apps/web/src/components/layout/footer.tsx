import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { LogoMark } from "@/components/logo";

const linkClass = "text-muted-foreground hover:text-foreground w-fit text-sm transition-colors";

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="border-t px-4 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex max-w-sm flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="text-[15px] font-semibold tracking-tight">{t("brand.name")}</span>
          </div>
          <p className="text-muted-foreground text-sm text-pretty">{t("brand.tagline")}</p>
        </div>
        <nav aria-label={t("nav.public")} className="flex flex-col gap-2.5">
          <Link href="/projects" className={linkClass}>
            {t("nav.projects")}
          </Link>
          <Link href="/verify" className={linkClass}>
            {t("nav.verify")}
          </Link>
          <Link href="/ledger" className={linkClass}>
            {t("nav.ledger")}
          </Link>
          <Link href="/tenders" className={linkClass}>
            {t("nav.tenders")}
          </Link>
        </nav>
        <nav aria-label={t("footer.legal")} className="flex flex-col gap-2.5">
          <Link href="/transparency" className={linkClass}>
            {t("nav.transparency")}
          </Link>
          <Link href="/privacy" className={linkClass}>
            {t("legal.privacyTitle")}
          </Link>
          <Link href="/terms" className={linkClass}>
            {t("legal.termsTitle")}
          </Link>
        </nav>
      </div>
      <div className="mx-auto max-w-6xl border-t py-4">
        <p className="text-muted-foreground text-xs">{t("footer.noPii")}</p>
      </div>
    </footer>
  );
}
