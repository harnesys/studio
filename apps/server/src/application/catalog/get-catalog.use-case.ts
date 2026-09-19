import type { StudioCatalog } from '@harnesys/studio-shared';
import { DRIVERS } from 'harnesys';

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
