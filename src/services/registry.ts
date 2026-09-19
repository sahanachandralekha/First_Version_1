import { serviceCatalog } from "./service-registry";
import type { ServiceMode } from "./types";

export { serviceCatalog };
export type { ServiceMode };

/** Active capability -> mode map, e.g. { "Vision detection": "REAL" } */
export function getServiceModes(): Record<string, ServiceMode> {
  return Object.fromEntries(serviceCatalog.map((service) => [service.name, service.mode]));
}

export function getServiceMode(name: string): ServiceMode {
  return getServiceModes()[name] ?? "MOCK";
}
