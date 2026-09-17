// A build's identity/metadata, without its gear - what GET /api/builds/mine
// actually returns (worker/src/routes/builds.ts's toBuildSummaryResponse).
// Nothing that lists builds (MyBuildsComponent, the duplicate-name checks,
// ownership confirmation) ever needs the blob itself, and at the 100-build
// cap sending it for every row would be up to ~400KB of dead weight per
// call - see BuildSummaryRow in the worker.
export interface BuildSummary {
  id: string;
  shortId: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
}

// The full build, gear included - what create/update return, and what a
// shared-link fetch decodes. `blob` is the opaque codec-encoded string -
// the same value that would otherwise sit in a `?b=` query param (see
// build-url-codec.service.ts).
export interface Build extends BuildSummary {
  blob: string;
}

// Display-only mirror of worker/src/routes/builds.ts's MAX_BUILDS_PER_USER -
// the worker is the authoritative enforcement point (this API is callable
// directly), this is just so the UI can show "X/100" without hardcoding the
// number twice. Keep these in sync by hand if the limit ever changes.
export const MAX_BUILDS_PER_USER = 100;
