import { Router } from '@angular/router';

import { NEW_BUILD_URL } from '../build/build-route';

/** Where the guided setup keeps its answers (NewBuildService): per tab, for a reload or Back from the planner. */
export const NEW_BUILD_ANSWERS_KEY = 'ddo-gear-planner-new-build-answers';

/**
 * Opens the guided setup for a new build, from scratch: the last setup's answers are
 * forgotten (its remembered packs aren't). Back from the planner, by contrast, finds them.
 * A function rather than a NewBuildService method, so the menus that start a build don't
 * construct the planner's services to do it.
 */
export function startNewBuild(router: Router): Promise<boolean> {
  try {
    sessionStorage.removeItem(NEW_BUILD_ANSWERS_KEY);
  } catch {
    // Nothing kept, so nothing to forget.
  }
  return router.navigateByUrl(NEW_BUILD_URL);
}
