import { bedRevisionInputSchema, type BedGeometry } from "@easygardenplan/contracts";
import { bed, bedGeometryRevision, garden, type Database } from "@easygardenplan/db";
import { validateBedGeometry } from "@easygardenplan/domain";
import { and, asc, eq } from "drizzle-orm";

export class BedRevisionConflictError extends Error {}
export class InvalidBedGeometryError extends Error { constructor(readonly issues: string[]) { super(issues.join("; ")); } }

export class BedRepository {
  constructor(private readonly database: Database, private readonly organizationId: string) {}

  async list(gardenId: string) {
    return await this.database.select({ id: bed.id, gardenId: bed.gardenId, name: bed.name, revision: bed.revision, revisionId: bedGeometryRevision.id, geometry: bedGeometryRevision.geometry, transform: bedGeometryRevision.geographicTransform, measurementProvenance: bedGeometryRevision.measurementProvenance, sunlight: bedGeometryRevision.sunlight, updatedAt: bed.updatedAt })
      .from(bed).innerJoin(bedGeometryRevision, eq(bedGeometryRevision.id, bed.activeRevisionId))
      .where(and(eq(bed.organizationId, this.organizationId), eq(bed.gardenId, gardenId))).orderBy(asc(bed.createdAt));
  }

  async save(gardenId: string, bedId: string | undefined, input: unknown) {
    const command = bedRevisionInputSchema.parse(input);
    const geometryIssues = validateBedGeometry(command.geometry);
    if (geometryIssues.length) throw new InvalidBedGeometryError(geometryIssues);
    return await this.database.transaction(async (transaction) => {
      const [plot] = await transaction.select({ id: garden.id }).from(garden).where(and(eq(garden.id, gardenId), eq(garden.organizationId, this.organizationId))).limit(1);
      if (!plot) throw new Error("Garden not found");
      const revisionId = crypto.randomUUID();
      if (!bedId) {
        if (command.expectedRevision !== 0) throw new BedRevisionConflictError("A new bed must start at revision 0");
        const id = crypto.randomUUID();
        await transaction.insert(bed).values({ id, organizationId: this.organizationId, gardenId, name: command.name, revision: 1, activeRevisionId: revisionId });
        const [revision] = await transaction.insert(bedGeometryRevision).values({ id: revisionId, organizationId: this.organizationId, bedId: id, revision: 1, geometry: command.geometry, geographicTransform: command.transform, measurementProvenance: command.measurementProvenance, sunlight: command.sunlight }).returning();
        return { bedId: id, revision: revision! };
      }
      const [updated] = await transaction.update(bed).set({ name: command.name, revision: command.expectedRevision + 1, activeRevisionId: revisionId, updatedAt: new Date() }).where(and(eq(bed.id, bedId), eq(bed.organizationId, this.organizationId), eq(bed.gardenId, gardenId), eq(bed.revision, command.expectedRevision))).returning();
      if (!updated) throw new BedRevisionConflictError("The bed changed while it was being edited");
      const [revision] = await transaction.insert(bedGeometryRevision).values({ id: revisionId, organizationId: this.organizationId, bedId, revision: updated.revision, geometry: command.geometry, geographicTransform: command.transform, measurementProvenance: command.measurementProvenance, sunlight: command.sunlight }).returning();
      return { bedId, revision: revision! };
    });
  }

  async history(bedId: string) { return await this.database.select().from(bedGeometryRevision).where(and(eq(bedGeometryRevision.organizationId, this.organizationId), eq(bedGeometryRevision.bedId, bedId))).orderBy(asc(bedGeometryRevision.revision)); }
}

export function dimensionedBedSvg(name: string, geometry: BedGeometry): string {
  const points = geometry.outer;
  const xs = points.map(({ x }) => x), ys = points.map(({ y }) => y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX), height = Math.max(1, maxY - minY), scale = Math.min(700 / width, 450 / height);
  const render = (ring: BedGeometry["outer"]) => ring.map(({ x, y }) => `${50 + (x - minX) * scale},${50 + (maxY - y) * scale}`).join(" ");
  const edges = points.map((point, index) => { const next = points[(index + 1) % points.length]!; const length = Math.hypot(next.x - point.x, next.y - point.y).toFixed(2); const x = 50 + ((point.x + next.x) / 2 - minX) * scale; const y = 45 + (maxY - (point.y + next.y) / 2) * scale; return `<text x="${x}" y="${y}" font-size="12" text-anchor="middle">${length} m</text>`; }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" role="img" aria-label="Dimensioned plan for ${escapeXml(name)}"><rect width="800" height="560" fill="white"/><text x="50" y="28" font-size="20" font-weight="bold">${escapeXml(name)}</text><polygon points="${render(points)}" fill="#dcfce7" stroke="#166534" stroke-width="3"/>${geometry.exclusions.map((ring) => `<polygon points="${render(ring)}" fill="white" stroke="#991b1b" stroke-width="2" stroke-dasharray="6 4"/>`).join("")}${edges}<path d="M740 90v-40m0 0-8 14m8-14 8 14" stroke="#111827" fill="none"/><text x="740" y="105" text-anchor="middle" font-size="12">North</text><text x="50" y="535" font-size="11">Scale derived from saved metric geometry. Provider imagery is not included.</text></svg>`;
}
function escapeXml(value: string): string { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
