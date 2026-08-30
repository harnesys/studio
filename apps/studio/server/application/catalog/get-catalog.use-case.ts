import { DRIVERS, driverDefaultUrl, driverEndpoints } from 'harnesys';
import type { StudioCatalog } from '../../../shared/types.ts';

export type GetCatalogInput = {
  execute(): StudioCatalog;
};

export class GetCatalogUseCase implements GetCatalogInput {
  execute(): StudioCatalog {
    return {
      drivers: DRIVERS.map((id) => ({
        id,
        defaultUrl: driverDefaultUrl(id),
        endpoints: driverEndpoints(id),
      })),
    };
  }
}
