import { DRIVERS } from 'harnesys';
import type { StudioCatalog } from '@harnesys/studio-shared';

export type GetCatalogInput = {
  execute(): StudioCatalog;
};

export class GetCatalogUseCase implements GetCatalogInput {
  execute(): StudioCatalog {
    return {
      drivers: DRIVERS.map((id) => ({
        id,
        defaultUrl: '',
        endpoints: [],
      })),
    };
  }
}
