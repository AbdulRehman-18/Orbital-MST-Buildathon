import { getTransparency } from "@namma-seva/api-client";
import { Mail, Phone, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useApi } from "@/lib/api";

const PRIVACY = ["s1", "s2", "s3", "s4", "s5", "s6"] as const;
const TERMS = ["t1", "t2", "t3", "t4", "t5", "t6"] as const;

/** Static legal text in all four languages (plan §17). Wording lives in `@namma-seva/i18n`. */
function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { t } = useTranslation();
  const report = useApi(["/api/transparency"], () => getTransparency());
  const officer = report.data?.disclosure.grievanceOfficer;
  const sections = kind === "privacy" ? PRIVACY : TERMS;
  const prefix = kind === "privacy" ? "legal.privacy" : "legal.terms";

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-brand font-mono text-xs tracking-widest uppercase">{t("legal.updated")}</p>
        <h1 className="font-display text-4xl font-semibold md:text-5xl">{t(kind === "privacy" ? "legal.privacyTitle" : "legal.termsTitle")}</h1>
        <Alert>
          <ShieldCheck />
          <AlertDescription>{t("legal.draftNote")}</AlertDescription>
        </Alert>
      </header>

      {sections.map((s, i) => (
        <section key={s} aria-labelledby={`${kind}-${s}`} className="flex flex-col gap-2">
          <h2 id={`${kind}-${s}`} className="flex items-baseline gap-3 text-xl font-bold">
            <span className="text-muted-foreground font-mono text-sm">{String(i + 1).padStart(2, "0")}</span>
            {t(`${prefix}.${s}Title`)}
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed text-pretty">{t(`${prefix}.${s}Body`)}</p>
        </section>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>{t("legal.contactTitle")}</CardTitle>
          <CardDescription>{t("legal.contactBody")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          {officer ? (
            <>
              <p className="font-semibold">{officer.name}</p>
              <a className="text-brand inline-flex w-fit items-center gap-2 underline underline-offset-4" href={`mailto:${officer.email}`}>
                <Mail className="size-4" aria-hidden="true" /> {officer.email}
              </a>
              {officer.phone && (
                <a className="text-brand inline-flex w-fit items-center gap-2 underline underline-offset-4" href={`tel:${officer.phone}`}>
                  <Phone className="size-4" aria-hidden="true" /> {officer.phone}
                </a>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">{t("transparency.adminUnknown")}</p>
          )}
        </CardContent>
      </Card>
    </article>
  );
}

export const PrivacyPage = () => <LegalPage kind="privacy" />;
export const TermsPage = () => <LegalPage kind="terms" />;
