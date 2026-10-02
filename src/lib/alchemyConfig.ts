// Public, browser-exposed Alchemy key — domain-restrict it on the Alchemy
// dashboard. Override per-deployment with VITE_ALCHEMY_API_KEY.
export const ALCHEMY_API_KEY =
  (import.meta.env.VITE_ALCHEMY_API_KEY as string) || "g6X4-HRGshx5XNp7gpDxLPeX-WSpw9pN";

