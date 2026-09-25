import { GardenScreen } from "./resources/garden.js";
import { useForm } from "@tanstack/react-form";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, RouterProvider, createRootRoute, createRoute, createRouter, useNavigate } from "@tanstack/react-router";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { healthResponseSchema } from "@easygardenplan/contracts";
import { authClient } from "./auth-client";
import { billingSubscriptionQueryKey } from "./tenant-query.js";
import { WebhookInspection } from "./webhook-inspection";
import { EditorialScreen } from "./editorial";
import "./styles.css";

const apiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/u, "") ?? "";
const api = (path: string) => `${apiOrigin}${path}`;

function Shell() {
  return <main className="mx-auto max-w-4xl px-6 py-12">
    <nav className="mb-10 flex items-center justify-between">
      <Link to="/" className="text-lg font-bold tracking-tight">Easy Garden Plan</Link>
      <div className="flex gap-5 text-sm font-medium text-slate-600">
        <Link to="/sign-in" activeProps={{ className: "text-brand-500" }}>Sign in</Link>
        <Link to="/sign-up" activeProps={{ className: "text-brand-500" }}>Create account</Link>
        <Link to="/gardens" activeProps={{ className: "text-brand-500" }}>My garden</Link>
        <Link to="/settings/billing" activeProps={{ className: "text-brand-500" }}>Plan</Link>
        {/* trestle:resource-links */}
      </div>
    </nav>
    <Outlet />
  </main>;
}

function Home() {
  const health = useQuery({ queryKey: ["health"], queryFn: async () => {
    const response = await fetch(api("/api/health"));
    return healthResponseSchema.parse(await response.json());
  }});
  return <section className="card p-10">
    <p className="eyebrow">Plan with your place in mind</p>
    <h1 className="mt-3 text-4xl font-semibold tracking-tight">A garden plan built around your yard.</h1>
    <p className="mt-4 max-w-2xl text-lg text-slate-600">Map your growing space, choose what you want to grow, and get a practical planting schedule for your climate.</p>
    <div className="mt-8 text-sm text-slate-500">Service: {health.isPending ? "checking" : health.data?.status ?? "unavailable"}</div>
  </section>;
}

function Field(props: { label: string; type: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium text-slate-700">{props.label}
    <input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-brand-500 focus:ring-2 focus:ring-blue-100" required minLength={props.type === "password" ? 8 : undefined} type={props.type} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
  </label>;
}

function AuthForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const form = useForm({
    defaultValues: { name: "", email: "", password: "" },
    onSubmit: async ({ value }) => {
      setError(undefined);
      const result = mode === "sign-up"
        ? await authClient.signUp.email({ name: value.name, email: value.email, password: value.password })
        : await authClient.signIn.email({ email: value.email, password: value.password });
      if (result.error) { setError(result.error.message ?? "Authentication failed"); return; }
      queryClient.clear();
      if (mode === "sign-in") {
        window.location.assign("/dashboard");
        return;
      }
      await navigate({ to: "/check-email" });
    },
  });
  return <section className="card mx-auto max-w-lg p-8">
    <p className="eyebrow">Account</p>
    <h1 className="mt-2 text-3xl font-semibold">{mode === "sign-up" ? "Create your account" : "Welcome back"}</h1>
    <form className="mt-8 space-y-5" onSubmit={(event) => { event.preventDefault(); void form.handleSubmit(); }}>
      {mode === "sign-up" && <form.Field name="name">{(field) => <Field label="Name" type="text" value={field.state.value} onChange={field.handleChange} />}</form.Field>}
      <form.Field name="email">{(field) => <Field label="Email" type="email" value={field.state.value} onChange={field.handleChange} />}</form.Field>
      <form.Field name="password">{(field) => <Field label="Password" type="password" value={field.state.value} onChange={field.handleChange} />}</form.Field>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>{([canSubmit, isSubmitting]) => <button className="button w-full" disabled={!canSubmit} type="submit">{isSubmitting ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>}</form.Subscribe>
      {mode === "sign-in" && <Link className="block text-center text-sm font-medium text-brand-500" to="/forgot-password">Forgot your password?</Link>}
    </form>
  </section>;
}

function CheckEmail() {
  const inbox = useQuery({ queryKey: ["captured-emails"], refetchInterval: 1000, queryFn: async () => {
    const response = await fetch(api("/api/dev/emails"));
    if (!response.ok) return { emails: [] as Array<{ id: string; to: string[]; subject: string; text: string }> };
    return response.json() as Promise<{ emails: Array<{ id: string; to: string[]; subject: string; text: string }> }>;
  }});
  return <section className="card p-8">
    <p className="eyebrow">Local email capture</p>
    <h1 className="mt-2 text-3xl font-semibold">Check your email</h1>
    <p className="mt-3 text-slate-600">Verification, password-reset, and invitation messages appear here during local development.</p>
    <div className="mt-6 space-y-3">{inbox.data?.emails.map((email) => {
      const link = email.text.match(/https?:\/\/\S+/u)?.[0];
      return <article className="rounded-xl border border-slate-200 p-4" key={email.id}><p className="font-semibold">{email.subject}</p><p className="text-sm text-slate-600">To: {email.to.join(", ")}</p>{link && <a className="mt-2 block text-sm font-semibold text-brand-500" href={link}>Open message link</a>}</article>;
    })}</div>
  </section>;
}

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string>();
  return <section className="card mx-auto max-w-lg p-8"><p className="eyebrow">Account recovery</p><h1 className="mt-2 text-3xl font-semibold">Reset your password</h1>
    <form className="mt-6 space-y-4" onSubmit={async (event) => { event.preventDefault(); const result = await authClient.requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` }); setMessage(result.error ? result.error.message ?? "Unable to request reset" : "If the account exists, a reset message has been sent."); }}>
      <Field label="Email" type="email" value={email} onChange={setEmail} /><button className="button w-full" type="submit">Send reset link</button>{message && <p className="text-sm text-slate-600">{message}</p>}
    </form></section>;
}

function ResetPassword() {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  return <section className="card mx-auto max-w-lg p-8"><p className="eyebrow">Account recovery</p><h1 className="mt-2 text-3xl font-semibold">Choose a new password</h1>
    <form className="mt-6 space-y-4" onSubmit={async (event) => { event.preventDefault(); const result = await authClient.resetPassword({ newPassword: password, token }); setMessage(result.error ? result.error.message ?? "Unable to reset password" : "Password updated. You can sign in now."); }}>
      <Field label="New password" type="password" value={password} onChange={setPassword} /><button className="button w-full" type="submit">Update password</button>{message && <p className="text-sm text-slate-600">{message}</p>}
    </form></section>;
}

function AcceptInvitation() {
  const invitationId = new URLSearchParams(window.location.search).get("id") ?? "";
  const [message, setMessage] = useState<string>();
  return <section className="card p-8"><p className="eyebrow">Organization invitation</p><h1 className="mt-2 text-3xl font-semibold">Join the organization</h1><button className="button mt-6" onClick={async () => { const result = await authClient.organization.acceptInvitation({ invitationId }); setMessage(result.error ? result.error.message ?? "Unable to accept invitation" : "Invitation accepted."); }}>Accept invitation</button>{message && <p className="mt-3 text-sm text-slate-600">{message}</p>}</section>;
}

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending } = authClient.useSession();
  const [deletePassword, setDeletePassword] = useState(""); const [deleteMessage, setDeleteMessage] = useState<string>(); const [deleting, setDeleting] = useState(false);
  useEffect(() => { if (!isPending && !session) void navigate({ to: "/sign-in", replace: true }); }, [isPending, navigate, session]);
  if (isPending || !session) return <p className="text-slate-600">Loading your account…</p>;
  return <section className="card p-8">
    <p className="eyebrow">Your account</p>
    <h1 className="mt-2 text-3xl font-semibold">Hello, {session.user.name}</h1>
    <p className="mt-2 text-slate-600">Signed in as {session.user.email}</p>
    <Link className="button mt-8 inline-block" to="/gardens">Open my garden</Link>
    <button className="mt-8 text-sm font-semibold text-red-600" onClick={async () => { await authClient.signOut(); queryClient.clear(); await navigate({ to: "/" }); }}>Sign out</button>
    <div className="mt-10 border-t border-red-100 pt-6"><h2 className="font-semibold text-red-800">Delete account</h2><p className="mt-2 text-sm text-slate-600">This permanently deletes your private household, garden, plans, progress, pending background work, and account. Cancel Pro first if it is active.</p><label className="mt-4 block text-sm font-medium">Confirm with your password<input className="mt-2 block w-full max-w-sm rounded-xl border px-4 py-2" onChange={(event) => setDeletePassword(event.target.value)} type="password" value={deletePassword} /></label><button className="mt-4 rounded-xl border border-red-300 px-4 py-2 text-sm font-semibold text-red-700" disabled={!deletePassword || deleting} onClick={async () => { setDeleting(true); setDeleteMessage(undefined); const result = await authClient.deleteUser({ password: deletePassword }); if (result.error) { setDeleteMessage(result.error.message ?? "Account could not be deleted"); setDeleting(false); return; } queryClient.clear(); window.location.assign("/"); }}>Permanently delete account</button>{deleteMessage && <p role="alert" className="mt-3 text-sm text-red-700">{deleteMessage}</p>}</div>
  </section>;
}

function BillingSettings() {
  const { data: session } = authClient.useSession();
  const { data: activeOrganization } = authClient.useActiveOrganization();
  const organizationId = activeOrganization?.id;
  type Subscription = { provider: string; plan: string; planVersion: number; status: string; currentPeriodEnd?: string; cancelAtPeriodEnd: boolean; entitlements: string[] };
  type BillingView = { subscription: Subscription | null; access: { plan: string; entitlements: string[] }; usage: Array<{ meter: string; used: number; limit: number | null }> };
  const subscription = useQuery({ queryKey: billingSubscriptionQueryKey(session?.user.id, organizationId), enabled: Boolean(session?.user.id && organizationId), queryFn: async () => { const response = await fetch(api("/api/billing/subscription"), { credentials: "include", headers: { "x-trestle-tenant": organizationId! } }); if (!response.ok) throw new Error("Sign in before managing billing"); return response.json() as Promise<BillingView>; } });
  const [message, setMessage] = useState<string>(); const [busy, setBusy] = useState(false);
  const post = async (path: string, body: unknown) => { if (!organizationId) throw new Error("Sign in before managing billing"); const response = await fetch(api(path), { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-trestle-tenant": organizationId }, body: JSON.stringify(body) }); const result = await response.json() as { url?: string; state?: string; error?: string; message?: string }; if (!response.ok) throw new Error(result.message ?? result.error ?? "Billing could not be updated"); return result; };
  const checkout = async () => { setBusy(true); setMessage("Opening secure checkout…"); try { const result = await post("/api/billing/checkout", { plan: "pro", requestId: crypto.randomUUID() }); if (!result.url) throw new Error("Checkout did not return a destination"); window.location.assign(result.url); } catch (error) { setMessage(error instanceof Error ? error.message : "Checkout is unavailable"); setBusy(false); } };
  const manage = async () => { setBusy(true); try { const result = await post("/api/billing/portal", { requestId: crypto.randomUUID() }); if (!result.url) throw new Error("Billing portal did not return a destination"); window.location.assign(result.url); } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to open billing portal"); setBusy(false); } };
  const change = async (action: "cancel" | "resume") => { setBusy(true); setMessage(undefined); try { const result = await post("/api/billing/subscription/actions", { action, requestId: crypto.randomUUID() }); setMessage(result.state === "processing" ? "Stripe is processing the change. Pro access updates after verified billing state arrives." : action === "cancel" ? "Pro is cancelled. Your garden, plan and history remain available on Free." : "Pro has resumed."); await subscription.refetch(); } catch (error) { setMessage(error instanceof Error ? error.message : "Billing could not be updated"); } finally { setBusy(false); } };
  const returned = new URLSearchParams(window.location.search).get("checkout");
  const active = subscription.data?.access.plan === "pro";
  const capabilities: Record<string, string> = { "garden.planning": "Garden map, plan, calendar and progress", "weather.monitoring": "Forecast monitoring and frost-risk alerts" };
  return <section className="card p-8"><p className="eyebrow">Settings</p><h1 className="mt-2 text-3xl font-semibold">Your plan</h1>{returned === "success" && <p aria-live="polite" className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900">Checkout completed. Pro activates after Stripe’s signed update is verified; refresh this page if it is still processing.</p>}{returned === "cancelled" && <p className="mt-4 text-sm text-slate-600">Checkout was cancelled. Your Free plan is unchanged.</p>}{!organizationId ? <p className="mt-4">Sign in to view plan details.</p> : subscription.isPending ? <p className="mt-4">Loading…</p> : subscription.error ? <p className="mt-4 text-red-700">{subscription.error.message}</p> : <div className="mt-6"><p className="text-xl">Current access: <strong className="capitalize">{subscription.data?.access.plan ?? "free"}</strong></p>{subscription.data?.subscription && <div className="mt-2 text-sm text-slate-600"><p>Billing status: {subscription.data.subscription.status.replaceAll("_", " ")}</p>{subscription.data.subscription.currentPeriodEnd && <p>Current period ends {new Date(subscription.data.subscription.currentPeriodEnd).toLocaleDateString()}</p>}<p>{subscription.data.subscription.cancelAtPeriodEnd ? "Cancellation is scheduled" : subscription.data.subscription.status === "active" ? "Renews automatically" : "No paid renewal is scheduled"}</p></div>}<div className="mt-5"><h2 className="font-semibold">Included</h2><ul className="mt-2 list-disc pl-5 text-sm text-slate-600">{(subscription.data?.access.entitlements ?? ["garden.planning"]).map((code) => <li key={code}>{capabilities[code] ?? code}</li>)}</ul></div>{active ? <div className="mt-6 flex flex-wrap gap-3">{subscription.data?.subscription?.provider === "stripe" && <button className="button" disabled={busy} onClick={() => void manage()}>Manage payment details</button>}{subscription.data?.subscription?.cancelAtPeriodEnd ? <button className="rounded-xl border px-4 py-2 font-semibold" disabled={busy} onClick={() => void change("resume")}>Resume Pro</button> : <button className="rounded-xl border px-4 py-2 font-semibold" disabled={busy} onClick={() => void change("cancel")}>Cancel Pro</button>}</div> : <div className="mt-6 rounded-2xl bg-emerald-50 p-5"><h2 className="font-semibold">Add Pro weather guidance</h2><p className="mt-1 text-sm text-slate-700">Get forecast monitoring, frost-risk warnings and a message when a warned risk passes.</p><button className="button mt-4" disabled={busy} onClick={() => void checkout()}>Continue to Pro checkout</button></div>}</div>}{message && <p aria-live="polite" className="mt-4 text-sm">{message}</p>}</section>;
}

const rootRoute = createRootRoute({ component: Shell });
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Home });
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sign-in", component: () => <AuthForm mode="sign-in" /> });
const signUpRoute = createRoute({ getParentRoute: () => rootRoute, path: "/sign-up", component: () => <AuthForm mode="sign-up" /> });
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: "/dashboard", component: Dashboard });
const checkEmailRoute = createRoute({ getParentRoute: () => rootRoute, path: "/check-email", component: CheckEmail });
const forgotPasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: "/forgot-password", component: ForgotPassword });
const resetPasswordRoute = createRoute({ getParentRoute: () => rootRoute, path: "/reset-password", component: ResetPassword });
const acceptInvitationRoute = createRoute({ getParentRoute: () => rootRoute, path: "/accept-invitation", component: AcceptInvitation });
const billingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings/billing", component: BillingSettings });
const webhookInspectionRoute = createRoute({ getParentRoute: () => rootRoute, path: "/settings/webhooks", component: WebhookInspection });
const gardenRoute = createRoute({ getParentRoute: () => rootRoute, path: "/gardens", component: GardenScreen });
const editorialRoute = createRoute({ getParentRoute: () => rootRoute, path: "/editorial", component: EditorialScreen });
const routeTree = rootRoute.addChildren([gardenRoute, editorialRoute, indexRoute, signInRoute, signUpRoute, dashboardRoute, checkEmailRoute, forgotPasswordRoute, resetPasswordRoute, acceptInvitationRoute, billingRoute, webhookInspectionRoute]);
const router = createRouter({ routeTree });
const queryClient = new QueryClient();

declare module "@tanstack/react-router" { interface Register { router: typeof router; } }

const element = document.querySelector("#root");
if (!element) throw new Error("Missing #root element");
createRoot(element).render(<StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></StrictMode>);
