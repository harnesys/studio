import type { Hono } from 'hono';
import type { GetCatalogInput } from '../../../application/catalog/get-catalog.use-case.ts';
export type CatalogControllerDeps = {
  getCatalog: GetCatalogInput;
};
export class CatalogController {
  constructor(private readonly deps: CatalogControllerDeps) {}
  register(app: Hono): void {
    app.get('/api/catalog', (c) => {
      return c.json(this.deps.getCatalog.execute());
    });
  }
}
