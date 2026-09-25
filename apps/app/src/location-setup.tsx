import type { GeocodeCandidate, Garden } from "@easygardenplan/contracts";
import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

const apiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/u, "") ?? "";
const mapKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;
type ClimateSummary = { state: "known" | "frost_free" | "unknown" | "uncertain"; hardinessZone: string | null; springFrostLocalDate: string | null; autumnFrostLocalDate: string | null; confidence: number; rationale: string; source: "dataset_match" | "user_anchor" | "unavailable" };

async function request<T>(path: string, organizationId: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, { ...init, credentials: "include", headers: { "content-type": "application/json", "x-trestle-tenant": organizationId, ...init?.headers } });
  const body = await response.json() as T & { message?: string; error?: string };
  if (!response.ok) throw new Error(body.message ?? body.error ?? "The request failed");
  return body;
}

function GardenMap(props: { latitude: number; longitude: number; onPick: (coordinate: { latitude: number; longitude: number }) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [styleId, setStyleId] = useState<"streets-v2" | "satellite">("satellite");
  const onPick = useRef(props.onPick);
  onPick.current = props.onPick;
  useEffect(() => {
    if (!container.current || !mapKey) return;
    const instance = new maplibregl.Map({ container: container.current, center: [props.longitude, props.latitude], zoom: 17, style: `https://api.maptiler.com/maps/${styleId}/style.json?key=${encodeURIComponent(mapKey)}`, attributionControl: { compact: true } });
    instance.addControl(new maplibregl.NavigationControl(), "top-right");
    marker.current = new maplibregl.Marker({ color: "#166534" }).setLngLat([props.longitude, props.latitude]).addTo(instance);
    instance.on("click", (event: MapMouseEvent) => onPick.current({ latitude: Number(event.lngLat.lat.toFixed(6)), longitude: Number(event.lngLat.lng.toFixed(6)) }));
    map.current = instance;
    return () => { marker.current = null; instance.remove(); map.current = null; };
  }, [styleId]);
  useEffect(() => { map.current?.setCenter([props.longitude, props.latitude]); marker.current?.setLngLat([props.longitude, props.latitude]); }, [props.latitude, props.longitude]);
  if (!mapKey) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">The aerial map is unavailable in this environment. Enter coordinates below to place the garden precisely.</div>;
  return <div><div className="mb-2 flex justify-end"><label className="text-xs font-medium text-slate-600">Map layer <select className="ml-2 rounded-lg border border-slate-300 px-2 py-1" value={styleId} onChange={(event) => setStyleId(event.target.value as "streets-v2" | "satellite")}><option value="satellite">Aerial</option><option value="streets-v2">Map</option></select></label></div><div aria-label="Garden map. Click to move the garden pin." className="h-80 overflow-hidden rounded-xl border border-slate-300" ref={container} /></div>;
}

export function LocationSetup(props: { garden: Garden; organizationId: string; onUpdated: (garden: Garden) => void }) {
  const [address, setAddress] = useState("");
  const [candidates, setCandidates] = useState<GeocodeCandidate[]>([]);
  const [latitude, setLatitude] = useState(Number(props.garden.latitude ?? 39.5));
  const [longitude, setLongitude] = useState(Number(props.garden.longitude ?? -98.35));
  const [timezone, setTimezone] = useState(props.garden.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [selection, setSelection] = useState<GeocodeCandidate>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [climate, setClimate] = useState<ClimateSummary | null>();
  const [springFrost, setSpringFrost] = useState("");
  const [autumnFrost, setAutumnFrost] = useState("");
  const [hardinessZone, setHardinessZone] = useState("");
  useEffect(() => { void request<{ climate: ClimateSummary | null }>(`/api/gardens/${props.garden.id}/climate`, props.organizationId).then((result) => setClimate(result.climate)).catch(() => setClimate(null)); }, [props.garden.id, props.organizationId]);

  const search = async () => {
    setBusy(true); setMessage(undefined);
    try {
      const result = await request<{ candidates: GeocodeCandidate[]; manualPinAvailable: boolean }>("/api/location/geocode", props.organizationId, { method: "POST", body: JSON.stringify({ text: address, limit: 5 }) });
      setCandidates(result.candidates);
      if (!result.candidates.length) setMessage("No matching address was found. Place the pin with coordinates instead.");
    } catch (error) { setMessage(`${error instanceof Error ? error.message : "Address search failed"}. You can still place the pin manually.`); }
    finally { setBusy(false); }
  };
  const choose = (candidate: GeocodeCandidate) => {
    setSelection(candidate); setLatitude(candidate.coordinate.latitude); setLongitude(candidate.coordinate.longitude);
    if (candidate.timezone) setTimezone(candidate.timezone);
  };
  const pick = (coordinate: { latitude: number; longitude: number }) => { setSelection(undefined); setLatitude(coordinate.latitude); setLongitude(coordinate.longitude); };
  const confirm = async () => {
    setBusy(true); setMessage(undefined);
    try {
      const result = await request<{ garden: Garden }>(`/api/gardens/${props.garden.id}/location`, props.organizationId, { method: "PUT", body: JSON.stringify({ expectedRevision: props.garden.revision, location: { coordinate: { latitude, longitude }, timezone, source: selection ? "geocoded" : "manual_pin", ...(selection ? { providerPlaceId: selection.providerPlaceId, formattedAddress: selection.formattedAddress } : {}) } }) });
      props.onUpdated(result.garden);
      const association = await request<{ climate: ClimateSummary }>(`/api/gardens/${props.garden.id}/climate/associate`, props.organizationId, { method: "POST", body: "{}" });
      setClimate(association.climate);
      setMessage("Location confirmed. Climate matching has been refreshed.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Location could not be confirmed"); }
    finally { setBusy(false); }
  };
  const saveAnchor = async (frostState: "known" | "frost_free" | "unknown") => {
    setBusy(true); setMessage(undefined);
    try {
      const result = await request<{ climate: ClimateSummary }>(`/api/gardens/${props.garden.id}/climate/anchor`, props.organizationId, { method: "PUT", body: JSON.stringify({ frostState, hardinessZone: hardinessZone || null, springFrostLocalDate: frostState === "known" ? springFrost : null, autumnFrostLocalDate: frostState === "known" ? autumnFrost : null, rationale: "Seasonal dates supplied by the gardener" }) });
      setClimate(result.climate); setMessage("Your seasonal anchor has been saved as gardener-supplied information.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Seasonal information could not be saved"); }
    finally { setBusy(false); }
  };

  return <section className="mt-10 border-t border-slate-200 pt-8">
    <p className="eyebrow">Location</p><h2 className="mt-2 text-2xl font-semibold">Place your garden</h2>
    <p className="mt-2 text-sm text-slate-600">Search by address, then confirm the pin. The address search may suggest several places; the pin you confirm is authoritative.</p>
    <div className="mt-5 flex gap-3"><input aria-label="Garden address" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3" placeholder="Enter a US address or place" value={address} onChange={(event) => setAddress(event.target.value)} /><button className="button" disabled={busy || address.trim().length < 3} onClick={() => void search()} type="button">Find</button></div>
    {candidates.length > 0 && <ul className="mt-3 space-y-2">{candidates.map((candidate) => <li key={candidate.providerPlaceId}><button className="w-full rounded-xl border border-slate-200 p-3 text-left text-sm hover:border-brand-500" onClick={() => choose(candidate)} type="button"><strong>{candidate.formattedAddress}</strong>{candidate.timezone && <span className="ml-2 text-slate-500">{candidate.timezone}</span>}</button></li>)}</ul>}
    <div className="mt-5"><GardenMap latitude={latitude} longitude={longitude} onPick={pick} /></div>
    <div className="mt-4 grid gap-4 sm:grid-cols-3"><label className="text-sm font-medium">Latitude<input className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" type="number" min="-90" max="90" step="0.000001" value={latitude} onChange={(event) => pick({ latitude: Number(event.target.value), longitude })} /></label><label className="text-sm font-medium">Longitude<input className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" type="number" min="-180" max="180" step="0.000001" value={longitude} onChange={(event) => pick({ latitude, longitude: Number(event.target.value) })} /></label><label className="text-sm font-medium">Time zone<input className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label></div>
    <button className="button mt-5" disabled={busy} onClick={() => void confirm()} type="button">{busy ? "Working…" : "Confirm this garden pin"}</button>
    {props.garden.locationConfirmed && <span className="ml-3 text-sm font-medium text-emerald-700">Pin confirmed</span>}
    {message && <p aria-live="polite" className="mt-3 text-sm text-slate-700">{message}</p>}
    <p className="mt-4 text-xs text-slate-500">Geocoding by Geoapify. Address data © OpenStreetMap contributors. Map tiles © MapTiler and OpenStreetMap contributors.</p>
    <div className="mt-8 rounded-xl border border-slate-200 p-5"><h3 className="font-semibold">Seasonal context</h3>{climate === undefined ? <p className="mt-2 text-sm text-slate-500">Checking climate information…</p> : climate ? <div className="mt-2 text-sm text-slate-700"><p>Status: <strong>{climate.state.replace("_", " ")}</strong>{climate.hardinessZone ? ` · Zone ${climate.hardinessZone}` : ""}</p><p className="mt-1">{climate.rationale}</p>{climate.state === "known" && <p className="mt-1">Typical anchors: spring {climate.springFrostLocalDate}, autumn {climate.autumnFrostLocalDate}</p>}</div> : <p className="mt-2 text-sm text-slate-600">No climate association has been saved yet.</p>}
      <p className="mt-4 text-sm text-slate-600">If the match is weak or unavailable, enter dates from a trusted local source or your own garden records. They remain labeled as your input.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium">Hardiness zone<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="8b" value={hardinessZone} onChange={(event) => setHardinessZone(event.target.value)} /></label><label className="text-xs font-medium">Last spring frost (MM-DD)<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="04-15" value={springFrost} onChange={(event) => setSpringFrost(event.target.value)} /></label><label className="text-xs font-medium">First autumn frost (MM-DD)<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" placeholder="10-20" value={autumnFrost} onChange={(event) => setAutumnFrost(event.target.value)} /></label></div>
      <div className="mt-3 flex flex-wrap gap-2"><button className="button" disabled={busy || !springFrost || !autumnFrost} onClick={() => void saveAnchor("known")} type="button">Use these dates</button><button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold" disabled={busy} onClick={() => void saveAnchor("frost_free")} type="button">My garden is frost-free</button><button className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold" disabled={busy} onClick={() => void saveAnchor("unknown")} type="button">Keep this unknown</button></div>
    </div>
  </section>;
}
