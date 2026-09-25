import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { authClient } from "./auth-client.js";

const apiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/u, "") ?? "";
type Evidence = { id: string; locator: string | null; normalizedClaim: string; scope: unknown; originalUnits: string | null; sourceUrl: string; sourceTitle: string; sourcePublisher: string };
type RuleRow = { id: string; cropName: string; ruleType: string; method: string; version: number; state: string; applicability: unknown; payload: unknown; evidence: Evidence[] };

async function request<T>(path: string, organizationId: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, { ...init, credentials: "include", headers: { "content-type": "application/json", "x-trestle-tenant": organizationId, ...init?.headers } });
  const body = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new Error((body as { message?: string })?.message ?? "Editorial action failed");
  return body as T;
}

export function EditorialScreen() {
  const { data: session } = authClient.useSession();
  const { data: household } = authClient.useActiveOrganization();
  const organizationId = household?.id;
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [releaseName, setReleaseName] = useState("");
  const [releaseNote, setReleaseNote] = useState("");
  const [rationales, setRationales] = useState<Record<string, string>>({});
  const rules = useQuery({ queryKey: ["editorial-rules", session?.user.id, organizationId], enabled: Boolean(session && organizationId), retry: false, queryFn: async () => (await request<{ rules: RuleRow[] }>("/api/editorial/rules", organizationId!)).rules });
  const review = useMutation({ mutationFn: async ({ id, decision }: { id: string; decision: "accepted" | "rejected" | "conflicted" }) => await request(`/api/editorial/rules/${id}/review`, organizationId!, { method: "POST", body: JSON.stringify({ decision, rationale: rationales[id] }) }), onSuccess: async () => await queryClient.invalidateQueries({ queryKey: ["editorial-rules"] }) });
  const publish = useMutation({ mutationFn: async () => await request("/api/editorial/releases", organizationId!, { method: "POST", body: JSON.stringify({ releaseName, note: releaseNote, ruleVersionIds: selected }) }), onSuccess: async () => { setSelected([]); setReleaseName(""); setReleaseNote(""); await queryClient.invalidateQueries({ queryKey: ["editorial-rules"] }); } });
  const error = rules.error ?? review.error ?? publish.error;
  return <section className="card p-8"><p className="eyebrow">Editorial</p><h1 className="mt-2 text-3xl font-semibold">Crop knowledge review</h1><p className="mt-3 text-slate-600">Inspect the source, normalized claim, scope and rule payload before recording a decision. Only accepted rules can enter a release.</p>
    {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error.message}</p>}
    <ul className="mt-7 space-y-5">{rules.data?.map((rule) => <li className="rounded-xl border border-slate-200 p-5" key={rule.id}>
      <label className="flex gap-3"><input type="checkbox" checked={selected.includes(rule.id)} disabled={rule.state !== "reviewed"} onChange={(event) => setSelected(event.target.checked ? [...selected, rule.id] : selected.filter((id) => id !== rule.id))} /><span><strong>{rule.cropName}</strong> · {rule.ruleType} · {rule.method}<span className="ml-2 text-xs text-slate-500">version {rule.version} · {rule.state}</span></span></label>
      <details className="mt-4 rounded-lg bg-slate-50 p-4" open={rule.state === "draft"}><summary className="cursor-pointer font-semibold">Evidence and normalized rule</summary>
        {rule.evidence.map((item) => <article className="mt-3 border-t border-slate-200 pt-3 text-sm" key={item.id}><p>{item.normalizedClaim}</p><p className="mt-1 text-slate-600">Scope: <code>{JSON.stringify(item.scope)}</code>{item.originalUnits ? ` · Original units: ${item.originalUnits}` : ""}</p><a className="mt-1 inline-block font-semibold text-brand-500" href={item.sourceUrl} rel="noreferrer" target="_blank">{item.sourcePublisher}: {item.sourceTitle}</a>{item.locator && <span className="ml-2 text-slate-500">{item.locator}</span>}</article>)}
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Applicability</p><pre className="mt-1 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(rule.applicability, null, 2)}</pre><p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Payload</p><pre className="mt-1 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(rule.payload, null, 2)}</pre>
      </details>
      {!["published", "withdrawn"].includes(rule.state) && <div className="mt-4"><label className="text-sm font-medium">Review rationale<textarea className="mt-1 block min-h-20 w-full rounded-lg border p-3" value={rationales[rule.id] ?? ""} onChange={(event) => setRationales({ ...rationales, [rule.id]: event.target.value })} /></label><div className="mt-2 flex flex-wrap gap-2">{(["accepted", "rejected", "conflicted"] as const).map((decision) => <button className="rounded-lg border px-3 py-2 text-sm font-semibold" disabled={!rationales[rule.id]?.trim() || review.isPending} key={decision} onClick={() => void review.mutateAsync({ id: rule.id, decision })} type="button">{decision === "accepted" ? "Accept" : decision === "rejected" ? "Reject" : "Mark conflicted"}</button>)}</div></div>}
    </li>)}</ul>
    <div className="mt-8 grid gap-3 sm:grid-cols-2"><input aria-label="Release name" className="rounded-xl border border-slate-300 px-4 py-3" placeholder="Release name" value={releaseName} onChange={(event) => setReleaseName(event.target.value)} /><input aria-label="Release note" className="rounded-xl border border-slate-300 px-4 py-3" placeholder="What this release covers" value={releaseNote} onChange={(event) => setReleaseNote(event.target.value)} /><button className="button sm:col-span-2" disabled={!releaseName.trim() || !releaseNote.trim() || selected.length === 0 || publish.isPending} onClick={() => void publish.mutateAsync()}>Publish {selected.length} reviewed rule{selected.length === 1 ? "" : "s"}</button></div>
  </section>;
}
