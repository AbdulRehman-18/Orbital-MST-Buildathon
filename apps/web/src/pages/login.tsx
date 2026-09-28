import type { DemoAccount, DemoCitizen, SessionUser } from "@namma-seva/api-client";
import { ArrowRight, FlaskConical, Loader2, Phone, ShieldCheck, Wallet } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import { ROLE_ICON } from "@/components/layout/nav";
import { LogoMark } from "@/components/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage, useDemo } from "@/lib/api";
import { ROLE_HOME, useAuth, type Role } from "@/lib/auth";
import { txError } from "@/lib/tx";
import { cn } from "@/lib/utils";

const ROLE_ACCENT: Record<string, string> = {
  GOVT_OFFICIAL: "from-orange-500/15 text-orange-700 dark:text-orange-400",
  AUDITOR: "from-sky-500/15 text-sky-700 dark:text-sky-400",
  CONTRACTOR: "from-amber-500/15 text-amber-700 dark:text-amber-400",
  ADMIN: "from-violet-500/15 text-violet-700 dark:text-violet-400",
  CITIZEN: "from-teal-500/15 text-teal-700 dark:text-teal-400",
};

export default function LoginPage() {
  const { t } = useTranslation();
  const demo = useDemo();
  const [, navigate] = useLocation();
  const search = useSearch();
  const next = new URLSearchParams(search).get("next");

  const done = (user: SessionUser) => {
    toast.success(t("login.signedInAs", { role: t(`roles.${user.role}`) }));
    if (user.role === "PUBLIC") toast.info(t("login.noRole"));
    navigate(next && next.startsWith("/") ? next : (ROLE_HOME[user.role] ?? "/"));
  };

  const demoOn = !!demo.data?.enabled;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <LogoMark className="size-10" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("login.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("login.subtitle")}</p>
        </div>
      </div>
      <Tabs defaultValue={demoOn ? "demo" : "citizen"} key={demoOn ? "demo" : "real"}>
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="demo">
            <FlaskConical /> {t("login.demoTab")}
          </TabsTrigger>
          <TabsTrigger value="citizen">
            <Phone /> {t("login.citizenTab")}
          </TabsTrigger>
          <TabsTrigger value="wallet">
            <Wallet /> {t("login.walletTab")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="demo" className="mt-4">
          {demoOn ? (
            <DemoPanel accounts={demo.data!.accounts} citizens={demo.data!.citizens} onDone={done} />
          ) : (
            <Alert>
              <FlaskConical />
              <AlertDescription>{t("login.demoOff")}</AlertDescription>
            </Alert>
          )}
        </TabsContent>
        <TabsContent value="citizen" className="mt-4">
          <PhonePanel onDone={done} />
        </TabsContent>
        <TabsContent value="wallet" className="mt-4">
          <WalletPanel onDone={done} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DemoPanel({ accounts, citizens, onDone }: { accounts: DemoAccount[]; citizens: DemoCitizen[]; onDone: (u: SessionUser) => void }) {
  const { t } = useTranslation();
  const { signInAsDemo, sendCode, signInWithPhone } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  async function wallet(a: DemoAccount) {
    setBusy(a.key);
    try {
      onDone(await signInAsDemo(a.key));
    } catch (err) {
      toast.error(txError(err));
    } finally {
      setBusy(null);
    }
  }

  async function citizen(c: DemoCitizen) {
    setBusy(c.key);
    try {
      const { devCode } = await sendCode(c.phone);
      if (!devCode) throw new Error("No demo code returned");
      toast.info(t("login.demoCode", { code: devCode }));
      onDone(await signInWithPhone(c.phone, devCode, c.name));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const order: Role[] = ["GOVT_OFFICIAL", "AUDITOR", "CONTRACTOR", "ADMIN"];
  const sorted = [...accounts].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground max-w-3xl text-sm">{t("login.demoIntro")}</p>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t("login.citizenDemoTitle")}</h2>
        <p className="text-muted-foreground -mt-2 text-xs">{t("login.citizenDemoBody")}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {citizens.map((c) => (
            <RoleCard
              key={c.key}
              role="CITIZEN"
              name={c.name}
              title={`${t("roles.CITIZEN")} · ${c.area}`}
              detail={c.phone.replace(/^\+91/, "+91 ")}
              busy={busy === c.key}
              disabled={!!busy}
              onClick={() => citizen(c)}
            />
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide uppercase">{t("nav.workspaces")}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((a) => (
            <RoleCard
              key={a.key}
              role={a.role}
              name={a.name}
              title={a.title}
              detail={`${t(`roles.${a.role}`)} · ${a.allWards ? t("common.allWards") : a.wards.length ? `${t("common.wards")} ${a.wards.join(", ")}` : a.address.slice(0, 10) + "…"}`}
              busy={busy === a.key}
              disabled={!!busy}
              onClick={() => wallet(a)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function RoleCard({
  role,
  name,
  title,
  detail,
  busy,
  disabled,
  onClick,
}: {
  role: string;
  name: string;
  title: string;
  detail: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const Icon = ROLE_ICON[role as Role] ?? ShieldCheck;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "group bg-card hover:border-primary focus-visible:ring-ring/50 relative flex min-h-28 flex-col gap-2 overflow-hidden rounded-xl border p-4 text-left transition focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60",
      )}
      aria-label={t("login.signInAs", { name })}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br to-transparent opacity-80", ROLE_ACCENT[role])} aria-hidden="true" />
      <div className="relative flex items-center gap-3">
        <div className={cn("bg-background flex size-10 items-center justify-center rounded-lg border", ROLE_ACCENT[role])}>
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{name}</p>
          <p className="text-muted-foreground truncate text-xs">{title}</p>
        </div>
        <ArrowRight className="text-muted-foreground ml-auto size-4 transition group-hover:translate-x-0.5" />
      </div>
      <p className="text-muted-foreground relative mt-auto truncate text-xs">{detail}</p>
    </button>
  );
}

function PhonePanel({ onDone }: { onDone: (u: SessionUser) => void }) {
  const { t } = useTranslation();
  const { sendCode, signInWithPhone } = useAuth();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    try {
      const r = await sendCode(phone);
      setSent(true);
      setDevCode(r.devCode);
      if (r.devCode) setCode(r.devCode);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setBusy(true);
    try {
      onDone(await signInWithPhone(phone, code));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("login.citizenTab")}</CardTitle>
        <CardDescription>{t("login.privacy")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phone" className="text-sm font-medium">
            {t("login.phoneLabel")}
          </label>
          <div className="flex gap-2">
            <span className="bg-muted flex items-center rounded-md border px-3 text-sm">+91</span>
            <Input
              id="phone"
              inputMode="tel"
              autoComplete="tel-national"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t("login.phonePlaceholder")}
              disabled={sent}
            />
          </div>
        </div>
        {!sent ? (
          <Button onClick={send} disabled={busy || phone.replace(/\D/g, "").length < 10}>
            {busy && <Loader2 className="animate-spin" />} {t("login.sendCode")}
          </Button>
        ) : (
          <>
            <p className="text-muted-foreground text-sm">{t("login.codeSent", { phone })}</p>
            {devCode && (
              <Alert className="border-civic/40">
                <FlaskConical />
                <AlertDescription>{t("login.demoCode", { code: devCode })}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="code" className="text-sm font-medium">
                {t("login.codeLabel")}
              </label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="font-mono text-lg tracking-[0.5em]"
              />
            </div>
            <Button onClick={verify} disabled={busy || code.length !== 6}>
              {busy && <Loader2 className="animate-spin" />} {t("login.verify")}
            </Button>
            <Button variant="link" className="w-fit px-0" onClick={() => (setSent(false), setCode(""), setDevCode(undefined))}>
              {t("login.resend")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function WalletPanel({ onDone }: { onDone: (u: SessionUser) => void }) {
  const { t } = useTranslation();
  const { signInWithWallet } = useAuth();
  const [busy, setBusy] = useState(false);
  const hasWallet = typeof window !== "undefined" && "ethereum" in window;

  async function go() {
    setBusy(true);
    try {
      onDone(await signInWithWallet());
    } catch (err) {
      const reason = txError(err);
      toast.error(reason === "rejected" ? t("tx.rejected") : reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("login.walletTab")}</CardTitle>
        <CardDescription>{t("login.walletBody")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!hasWallet && (
          <Alert>
            <Wallet />
            <AlertDescription>{t("login.noWallet")}</AlertDescription>
          </Alert>
        )}
        <Button onClick={go} disabled={busy || !hasWallet}>
          {busy ? <Loader2 className="animate-spin" /> : <Wallet />} {t("login.connectAndSign")}
        </Button>
      </CardContent>
    </Card>
  );
}
