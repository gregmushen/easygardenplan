import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { authClient } from "./auth-client.js";

const apiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/u, "") ?? "";
type RuleRow = { id: string; version: number; state: string; payload: unknown; evidenceIds: string[] };

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
  const rules = useQuery({ queryKey: ["editorial-rules", session?.user.id, organizationId], enabled: Boolean(session && organizationId), retry: false, queryFn: async () => (await request<{ rules: RuleRow[] }>("/api/editorial/rules", organizationId!)).rules });
  const review = useMutation({ mutationFn: async (id: string) => await request(`/api/editorial/rules/${id}/review`, organizationId!, { method: "POST", body: JSON.stringify({ decision: "accepted", rationale: "Reviewed against the recorded evidence and scope." }) }), onSuccess: async () => await queryClient.invalidateQueries({ queryKey: ["editorial-rules"] }) });
  const publish = useMutation({ mutationFn: async () => await request("/api/editorial/releases", organizationId!, { method: "POST", body: JSON.stringify({ releaseName, ruleVersionIds: selected }) }), onSuccess: async () => { setSelected([]); setReleaseName(""); await queryClient.invalidateQueries({ queryKey: ["editorial-rules"] }); } });
  const error = rules.error ?? review.error ?? publish.error;
  return <section className="card p-8"><p className="eyebrow">Editorial</p><h1 className="mt-2 text-3xl font-semibold">Crop knowledge review</h1><p className="mt-3 text-slate-600">Review evidence-backed drafts, resolve conflicts, and publish an immutable catalog release.</p>
    {error && <p className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error.message}</p>}
    <ul className="mt-7 space-y-3">{rules.data?.map((rule) => <li className="rounded-xl border border-slate-200 p-4" key={rule.id}><label className="flex gap-3"><input type="checkbox" checked={selected.includes(rule.id)} disabled={rule.state !== "reviewed"} onChange={(event) => setSelected(event.target.checked ? [...selected, rule.id] : selected.filter((id) => id !== rule.id))} /><span className="min-w-0"><strong>Version {rule.version}</strong> · {rule.state}<span className="mt-1 block text-xs text-slate-500">{rule.evidenceIds.length} evidence item(s)</span></span></label>{rule.state === "draft" && <button className="mt-3 text-sm font-semibold text-brand-500" onClick={() => void review.mutateAsync(rule.id)}>Accept review</button>}</li>)}</ul>
    <div className="mt-8 flex gap-3"><input aria-label="Release name" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3" value={releaseName} onChange={(event) => setReleaseName(event.target.value)} /><button className="button" disabled={!releaseName || selected.length === 0 || publish.isPending} onClick={() => void publish.mutateAsync()}>Publish release</button></div>
  </section>;
}
