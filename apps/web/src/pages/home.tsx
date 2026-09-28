import { ArrowRight, Camera, Link2, Megaphone, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { network } from "@/lib/chain";

const STEPS = [
  { icon: Link2, title: "home.step1Title", body: "home.step1Body" },
  { icon: Camera, title: "home.step2Title", body: "home.step2Body" },
  { icon: Megaphone, title: "home.step3Title", body: "home.step3Body" },
] as const;

export default function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12">
      <section className="flex flex-col gap-6 pt-4 md:pt-10">
        <Badge variant="secondary" className="w-fit">
          {t("brand.tagline")}
        </Badge>
        <h1 className="max-w-3xl text-3xl font-bold tracking-tight text-balance md:text-5xl">
          {t("home.heroTitle")}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-lg text-pretty">{t("home.heroBody")}</p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link href="/projects">
              {t("home.ctaExplore")} <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/verify">
              <Search /> {t("home.ctaVerify")}
            </Link>
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">{t("home.stepsTitle")}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <Card key={title}>
              <CardHeader>
                <div className="bg-accent text-accent-foreground mb-2 flex size-10 items-center justify-center rounded-lg">
                  <Icon className="size-5" />
                </div>
                <CardTitle>{t(title)}</CardTitle>
                <CardDescription>{t(body)}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <p className="text-muted-foreground text-xs">
        {network.name} · chain ID <span className="font-mono">{network.id}</span> ·{" "}
        {network.blockExplorers.default.url && (
          <a
            className="underline underline-offset-4"
            href={network.blockExplorers.default.url}
            target="_blank"
            rel="noreferrer"
          >
            mstscan
          </a>
        )}
      </p>
    </div>
  );
}
