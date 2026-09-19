export type ServiceMode = "REAL" | "MOCK" | "FUTURE";
export interface ServiceDescriptor { readonly name: string; readonly mode: ServiceMode; readonly description: string }
export interface AppError { title: string; whatHappened: string; whatYouCanDo: string; retry?: () => void }
