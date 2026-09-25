import type { Garden, CreateGarden, UpdateGarden } from "@easygardenplan/contracts";

export interface GardenRepository {
  list(input: { cursor?: string; limit: number }): Promise<{ items: Garden[]; nextCursor?: string }>;
  get(id: string): Promise<Garden | null>;
  create(input: CreateGarden): Promise<Garden>;
  update(id: string, input: UpdateGarden): Promise<Garden | null>;
  remove(id: string): Promise<boolean>;
}

export class GardenService {
  constructor(private readonly repository: GardenRepository) {}
  list(input: { cursor?: string; limit: number }) { return this.repository.list(input); }
  get(id: string) { return this.repository.get(id); }
  create(input: CreateGarden) { return this.repository.create(input); }
  update(id: string, input: UpdateGarden) { return this.repository.update(id, input); }
  remove(id: string) { return this.repository.remove(id); }
}
