import { gardenUpdateSchema, type Garden } from "@easygardenplan/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { authClient } from "../auth-client.js";
import { createGardenApi } from "../api/garden.js";
import { LocationSetup } from "../location-setup.js";
import { BedEditor } from "../bed-editor.js";
import { PlanBuilder } from "../plan-builder.js";
import { GardenCalendar } from "../garden-calendar.js";

const apiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/u, "") ?? "";
type Workspace = { organizationId: string; gardenId: string };

async function bootstrapWorkspace(): Promise<Workspace> {
  const response = await fetch(`${apiOrigin}/api/workspace/bootstrap`, { method: "POST", credentials: "include", headers: { origin: window.location.origin } });
  if (!response.ok) throw new Error(response.status === 401 ? "Sign in to open your garden." : "We could not prepare your garden.");
  return (await response.json() as { workspace: Workspace }).workspace;
}

type Draft = { name: string; latitude: string; longitude: string; timezone: string; units: "imperial" | "metric"; conditions: string; monitoringEnabled: boolean; locationConfirmed: boolean };
const draftFrom = (garden: Garden): Draft => ({
  name: garden.name,
  latitude: garden.latitude ?? "",
  longitude: garden.longitude ?? "",
  timezone: garden.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  units: garden.units === "metric" ? "metric" : "imperial",
  conditions: garden.conditions ?? "",
  monitoringEnabled: garden.monitoringEnabled ?? false,
  locationConfirmed: garden.locationConfirmed ?? false,
});

export function GardenScreen() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const queryClient = useQueryClient();
  const workspace = useQuery({ queryKey: ["workspace", session?.user.id], enabled: Boolean(session?.user.id), queryFn: bootstrapWorkspace });
  const gardenQuery = useQuery({
    queryKey: ["garden", session?.user.id, workspace.data?.gardenId],
    enabled: Boolean(workspace.data),
    queryFn: async () => await createGardenApi(workspace.data!.organizationId).get(workspace.data!.gardenId),
  });
  const [draft, setDraft] = useState<Draft>();
  useEffect(() => { if (gardenQuery.data) setDraft(draftFrom(gardenQuery.data)); }, [gardenQuery.data]);
  const save = useMutation({
    mutationFn: async () => {
      if (!workspace.data || !draft) throw new Error("Garden is not ready");
      return await createGardenApi(workspace.data.organizationId).update(workspace.data.gardenId, gardenUpdateSchema.parse({
        ...draft,
        latitude: draft.latitude || undefined,
        longitude: draft.longitude || undefined,
        timezone: draft.timezone || undefined,
        conditions: draft.conditions || undefined,
      }));
    },
    onSuccess: async (garden) => {
      setDraft(draftFrom(garden));
      await queryClient.invalidateQueries({ queryKey: ["garden", session?.user.id, workspace.data?.gardenId] });
    },
  });

  if (sessionPending) return <p className="text-slate-600">Opening your garden…</p>;
  if (!session) return <section className="card p-8"><p className="eyebrow">Your garden</p><h1 className="mt-2 text-3xl font-semibold">Sign in to start planning</h1></section>;
  const error = workspace.error ?? gardenQuery.error ?? save.error;
  if (!draft) return <section className="card p-8"><p className="eyebrow">Your garden</p><h1 className="mt-2 text-3xl font-semibold">Preparing your private plan…</h1>{error && <p role="alert" className="mt-4 text-red-700">{error.message}</p>}</section>;
  const field = (key: "name" | "latitude" | "longitude" | "timezone" | "conditions", label: string, placeholder?: string) => <label className="block text-sm font-medium text-slate-700">{label}<input className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" value={draft[key]} placeholder={placeholder} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>;

  return <section className="card p-8">
    <p className="eyebrow">Your garden</p>
    <h1 className="mt-2 text-3xl font-semibold">Garden basics</h1>
    <p className="mt-3 text-slate-600">These details anchor planting dates and recommendations. You can refine them as the garden takes shape.</p>
    <form className="mt-8 space-y-6" onSubmit={(event) => { event.preventDefault(); void save.mutateAsync(); }}>
      {field("name", "Garden name")}
      <label className="block text-sm font-medium text-slate-700">Units<select className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" value={draft.units} onChange={(event) => setDraft({ ...draft, units: event.target.value as Draft["units"] })}><option value="imperial">Imperial</option><option value="metric">Metric</option></select></label>
      {field("conditions", "Site notes", "Slope, wind, drainage, shade, soil, or access notes")}
      <label className="flex items-center gap-3 text-sm text-slate-700"><input type="checkbox" checked={draft.monitoringEnabled} onChange={(event) => setDraft({ ...draft, monitoringEnabled: event.target.checked })} />Prepare this garden for weather monitoring.</label>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error.message}</p>}
      <button className="button" disabled={save.isPending} type="submit">{save.isPending ? "Saving…" : "Save garden"}</button>
      {save.isSuccess && <span className="ml-4 text-sm font-medium text-emerald-700">Saved</span>}
    </form>
    {gardenQuery.data && workspace.data && <LocationSetup garden={gardenQuery.data} organizationId={workspace.data.organizationId} onUpdated={(garden) => { setDraft(draftFrom(garden)); queryClient.setQueryData(["garden", session.user.id, workspace.data?.gardenId], garden); }} />}
    {gardenQuery.data && workspace.data && <BedEditor garden={gardenQuery.data} organizationId={workspace.data.organizationId} />}
    {gardenQuery.data && workspace.data && <PlanBuilder garden={gardenQuery.data} organizationId={workspace.data.organizationId} />}
    {gardenQuery.data && workspace.data && <GardenCalendar garden={gardenQuery.data} organizationId={workspace.data.organizationId} />}
  </section>;
}
