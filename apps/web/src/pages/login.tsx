import type { DemoAccount, DemoCitizen, SessionUser } from "@namma-seva/api-client";
import { ArrowLeft, ArrowRight, FlaskConical, Loader2, Phone, Wallet, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link, useLocation, useSearch } from "wouter";
import { ROLE_VISUAL, ToneIcon, type Tone } from "@/components/common/tone";
import { LogoMark } from "@/components/logo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage, useDemo } from "@/lib/api";
import { ROLE_HOME, useAuth, type Role } from "@/lib/auth";
import { network } from "@/lib/chain";
import { shortAddress } from "@/lib/format";
import { txError } from "@/lib/tx";
import { cn } from "@/lib/utils";

const eyebrow = "text-muted-foreground text-sm font-medium";

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
    <div className="grid min-h-svh lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <main id="main" className="flex min-w-0 flex-col">
        <header className="flex h-14 items-center justify-between border-b px-4 sm:px-8 lg:px-12">
          <Link href="/" className="flex items-center gap-2.5" aria-label={t("brand.name")}>
            <LogoMark className="size-7" />
            <span className="text-[15px] font-semibold tracking-tight">{t("brand.name")}</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/" className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 px-2 text-[13px] transition-colors">
              <ArrowLeft className="size-3.5" /> {t("nav.home")}
            </Link>
            <LanguageSwitcher />
          </div>
        </header>

        <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-8 lg:px-12">
          <div className="animate-rise flex w-full max-w-xl flex-col gap-8">
            <div className="flex flex-col gap-4">
              <h1 className="text-[clamp(2rem,4.4vw,3rem)] leading-[1.02] font-semibold tracking-[-0.045em] text-balance">{t("login.title")}</h1>
              <p className="text-muted-foreground max-w-md text-pretty">{t("login.subtitle")}</p>
            </div>

            <Tabs defaultValue={demoOn ? "demo" : "citizen"} key={demoOn ? "demo" : "real"}>
              <TabsList variant="line" className="h-auto w-full justify-start gap-6 border-b p-0">
                <LoginTab value="citizen" tone="teal" icon={Phone}>
                  {t("login.citizenTab")}
                </LoginTab>
                <LoginTab value="wallet" tone="violet" icon={Wallet}>
                  {t("login.walletTab")}
                </LoginTab>
                <LoginTab value="demo" tone="amber" icon={FlaskConical}>
                  {t("login.demoTab")}
                </LoginTab>
              </TabsList>
              <TabsContent value="wallet" className="mt-8">
                <WalletPanel onDone={done} />
              </TabsContent>
              <TabsContent value="citizen" className="mt-8">
                <PhonePanel onDone={done} />
              </TabsContent>
              <TabsContent value="demo" className="mt-8">
                {demoOn ? (
                  <DemoPanel accounts={demo.data!.accounts} citizens={demo.data!.citizens} onDone={done} />
                ) : (
                  <Alert>
                    <FlaskConical />
                    <AlertDescription>{t("login.demoOff")}</AlertDescription>
                  </Alert>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
      <WelcomePanel />
    </div>
  );
}

function LoginTab({ value, icon: Icon, tone, children }: { value: string; icon: LucideIcon; tone: Tone; children: ReactNode }) {
  return (
    <TabsTrigger
      value={value}
      className={`tone-${tone} text-muted-foreground data-[state=active]:text-foreground h-11 flex-none gap-2 px-0 text-sm after:bottom-[-1px] data-[state=active]:bg-transparent`}
    >
      <Icon className="text-(--tone-fg)" />
      {children}
    </TabsTrigger>
  );
}

/** Black side panel: who signs in how, in plain words. */
function WelcomePanel() {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    ["CITIZEN", "home.whoCitizen"],
    ["GOVT_OFFICIAL", "home.whoOfficial"],
    ["CONTRACTOR", "home.whoContractor"],
    ["AUDITOR", "home.whoAuditor"],
  ];
  return (
    <aside aria-hidden="true" className="bg-foreground text-background relative hidden overflow-hidden lg:sticky lg:top-0 lg:flex lg:h-svh">
      <div className="bg-lattice-inverse pointer-events-none absolute inset-0" />
      <div className="relative flex w-full flex-col justify-end gap-10 p-12">
        <p className="max-w-sm text-4xl leading-[1.08] font-medium tracking-[-0.035em] text-balance">{t("home.safeTitle")}</p>
        <ul className="flex flex-col divide-y divide-white/15 rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm">
          {rows.map(([role, body]) => {
            const v = ROLE_VISUAL[role];
            return (
              <li key={role} className="flex items-start gap-4 p-5">
                <ToneIcon icon={v.icon} tone={v.tone} size="sm" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{t(`roles.${role}`)}</span>
                  <span className="text-sm text-white/60">{t(body)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
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
    <div className="flex flex-col gap-8">
      <p className="text-muted-foreground text-sm text-pretty">{t("login.demoIntro")}</p>
      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className={eyebrow}>{t("login.citizenDemoTitle")}</h2>
          <p className="text-muted-foreground text-xs">{t("login.citizenDemoBody")}</p>
        </div>
        <ul className="divide-y overflow-hidden rounded-xl border">
          {citizens.map((c) => (
            <li key={c.key}>
              <RoleRow
                role="CITIZEN"
                name={c.name}
                title={`${t("roles.CITIZEN")} · ${c.area}`}
                detail={c.phone.replace(/^\+91/, "+91 ")}
                busy={busy === c.key}
                disabled={!!busy}
                onClick={() => citizen(c)}
              />
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className={eyebrow}>{t("nav.workspaces")}</h2>
        <ul className="divide-y overflow-hidden rounded-xl border">
          {sorted.map((a) => (
            <li key={a.key}>
              <RoleRow
                role={a.role}
                name={a.name}
                title={a.title}
                detail={a.allWards ? shortAddress(a.address) : a.wards.length ? `${t("common.wards")} ${a.wards.join(", ")}` : shortAddress(a.address)}
                tag={t(`roles.${a.role}`)}
                busy={busy === a.key}
                disabled={!!busy}
                onClick={() => wallet(a)}
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RoleRow({
  role,
  name,
  title,
  detail,
  tag,
  busy,
  disabled,
  onClick,
}: {
  role: string;
  name: string;
  title: string;
  detail: string;
  tag?: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const v = ROLE_VISUAL[role] ?? ROLE_VISUAL.PUBLIC;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group hover:bg-muted flex w-full items-center gap-4 px-4 py-3.5 text-left transition-colors focus-visible:outline-offset-[-2px] disabled:opacity-50 disabled:hover:bg-transparent"
      aria-label={t("login.signInAs", { name })}
    >
      {busy ? (
        <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl">
          <Loader2 className="size-5 animate-spin" />
        </span>
      ) : (
        <ToneIcon icon={v.icon} tone={v.tone} />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="text-muted-foreground truncate text-xs">{title}</span>
      </span>
      <span className="text-muted-foreground hidden shrink-0 flex-col items-end gap-0.5 text-xs sm:flex">
        {tag && <span className="text-foreground">{tag}</span>}
        <span>{detail}</span>
      </span>
      <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
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
  // DPDP Act 2023: the notice must be accepted before we ask the server to text this number.
  const [agreed, setAgreed] = useState(false);

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
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm text-pretty">{t("login.privacy")}</p>
      {!sent && (
        <section aria-labelledby="consent-title" className="flex flex-col gap-3 rounded-xl border p-5 text-sm">
          <h2 id="consent-title" className="text-base font-semibold tracking-tight">
            {t("consent.title")}
          </h2>
          <p className="text-muted-foreground">{t("consent.intro")}</p>
          <ul className="text-muted-foreground flex flex-col gap-2">
            {["consent.c1", "consent.c2", "consent.c3"].map((k) => (
              <li key={k} className="flex gap-3">
                <span className="bg-foreground mt-2 size-1 shrink-0" aria-hidden="true" />
                {t(k)}
              </li>
            ))}
          </ul>
          <Link href="/privacy" target="_blank" rel="noreferrer" className="w-fit font-medium underline underline-offset-4">
            {t("consent.readNotice")}
          </Link>
          <label htmlFor="consent" className="flex cursor-pointer items-start gap-3 border-t pt-4 font-medium">
            <Checkbox id="consent" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
            <span>{t("consent.agree")}</span>
          </label>
        </section>
      )}
      <div className="flex flex-col gap-2">
        <label htmlFor="phone" className={eyebrow}>
          {t("login.phoneLabel")}
        </label>
        <div className="flex">
          <span className="text-muted-foreground bg-muted flex items-center rounded-l-lg border border-r-0 px-3 text-sm">+91</span>
          <Input
            id="phone"
            inputMode="tel"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t("login.phonePlaceholder")}
            disabled={sent}
            className="h-11 rounded-l-none"
          />
        </div>
      </div>
      {!sent ? (
        <>
          <Button size="lg" onClick={send} disabled={busy || !agreed || phone.replace(/\D/g, "").length < 10} aria-describedby={agreed ? undefined : "consent-required"}>
            {busy && <Loader2 className="animate-spin" />} {t("login.sendCode")}
          </Button>
          {!agreed && (
            <p id="consent-required" className="text-muted-foreground -mt-3 text-xs">
              {t("consent.required")}
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t("login.codeSent", { phone })}</p>
          {devCode && (
            <Alert>
              <FlaskConical />
              <AlertDescription>{t("login.demoCode", { code: devCode })}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-col gap-2">
            <label htmlFor="code" className={eyebrow}>
              {t("login.codeLabel")}
            </label>
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="h-14 font-mono text-2xl tracking-[0.6em]"
            />
          </div>
          <Button size="lg" onClick={verify} disabled={busy || code.length !== 6}>
            {busy && <Loader2 className="animate-spin" />} {t("login.verify")}
          </Button>
          <Button variant="link" className="w-fit px-0" onClick={() => (setSent(false), setCode(""), setDevCode(undefined))}>
            {t("login.resend")}
          </Button>
        </>
      )}
    </div>
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

  // The exact message the wallet will show (EIP-4361), so nothing about the signature is a surprise.
  const preview = [
    `${window.location.host} wants you to sign in with your Ethereum account:`,
    "0x…",
    "",
    "Sign in to Namma Seva. This does not send a transaction or cost gas.",
    "",
    `URI: ${window.location.origin}`,
    "Version: 1",
    `Chain ID: ${network.id}`,
  ].join("\n");

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm text-pretty">{t("login.walletBody")}</p>
      <pre className="text-muted-foreground bg-muted overflow-x-auto rounded-lg border p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap" aria-hidden="true">
        {preview}
      </pre>
      {!hasWallet && (
        <Alert>
          <Wallet />
          <AlertDescription>{t("login.noWallet")}</AlertDescription>
        </Alert>
      )}
      <Button size="lg" onClick={go} disabled={busy || !hasWallet}>
        {busy ? <Loader2 className="animate-spin" /> : <Wallet />} {t("login.connectAndSign")}
      </Button>
    </div>
  );
}
