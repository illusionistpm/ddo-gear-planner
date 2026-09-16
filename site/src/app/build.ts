// Formalizes what's otherwise just "the combined params record" that
// QueryParamsService/BuildUrlCodecService pass around as a plain object.
// `blob` is the opaque codec-encoded string - the same value that would
// otherwise sit in a `?b=` query param (see build-url-codec.service.ts).
export interface Build {
  id: string;
  shortId: string;
  name: string;
  blob: string;
  ownerUserId?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Display-only mirror of worker/src/routes/builds.ts's MAX_BUILDS_PER_USER -
// the worker is the authoritative enforcement point (this API is callable
// directly), this is just so the UI can show "X/100" without hardcoding the
// number twice. Keep these in sync by hand if the limit ever changes.
export const MAX_BUILDS_PER_USER = 100;
