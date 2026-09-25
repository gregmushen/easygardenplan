import { gardenCreateSchema, gardenSchema, gardenUpdateSchema, type CreateGarden, type Garden, type UpdateGarden } from "@easygardenplan/contracts";

const apiOrigin = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.replace(/\/$/u, "") ?? "";
async function request<T>(organizationId: string, pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin}${pathname}`, { ...init, credentials: "include", headers: { "content-type": "application/json", "x-trestle-tenant": organizationId, ...init?.headers } });
  const body = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new Error((body as { message?: string; error?: string } | undefined)?.message ?? (body as { error?: string } | undefined)?.error ?? `Request failed (${response.status})`);
  return body as T;
}

export function createGardenApi(organizationId: string) {
  return {
    async list(input: { cursor?: string; limit?: number } = {}): Promise<{ items: Garden[]; nextCursor?: string }> {
      const query = new URLSearchParams();
      if (input.cursor) query.set("cursor", input.cursor);
      if (input.limit) query.set("limit", String(input.limit));
      const result = await request<{ gardens: unknown[]; nextCursor?: string }>(organizationId, "/api/gardens" + (query.size ? "?" + query.toString() : ""));
      return { items: result.gardens.map((item) => gardenSchema.parse(item)), ...(result.nextCursor ? { nextCursor: result.nextCursor } : {}) };
    },
    async get(id: string): Promise<Garden> { const result = await request<{ garden: unknown }>(organizationId, `/api/gardens/${id}`); return gardenSchema.parse(result.garden); },
    async create(input: CreateGarden): Promise<Garden> { const result = await request<{ garden: unknown }>(organizationId, "/api/gardens", { method: "POST", body: JSON.stringify(gardenCreateSchema.parse(input)) }); return gardenSchema.parse(result.garden); },
    async update(id: string, input: UpdateGarden): Promise<Garden> { const result = await request<{ garden: unknown }>(organizationId, `/api/gardens/${id}`, { method: "PATCH", body: JSON.stringify(gardenUpdateSchema.parse(input)) }); return gardenSchema.parse(result.garden); },
    async remove(id: string): Promise<void> { await request<void>(organizationId, `/api/gardens/${id}`, { method: "DELETE" }); },
  };
}
