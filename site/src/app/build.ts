import sharedConstants from '../../../shared/constants.json';

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

// Read from shared/constants.json - see its README. The worker
// (worker/src/routes/builds.ts) is the authoritative enforcement point for
// both of these (this API is callable directly); this is just so the UI
// can show "X/100" without a separate number to keep in sync, and so
// createBuild/saveInPlace can reject an oversized blob early with a
// friendly message instead of waiting for the server's 400 - see
// BuildActionsComponent.currentBlob's use of MAX_BLOB_LENGTH.
export const MAX_BUILDS_PER_USER = sharedConstants.maxBuildsPerUser;
export const MAX_BLOB_LENGTH = sharedConstants.maxBlobLength;
