/**
 * How long a just-changed element keeps its highlight class (effects-table's
 * `recently-changed` chips, the equipment sidebar's `recently-equipped` slot).
 *
 * It must outlast the 1.8s pulse animations those classes start
 * (effects-table.component.css, styles.css) - removing the class sooner cuts
 * the animation off mid-pulse. Change the two together.
 */
export const RECENT_CHANGE_HIGHLIGHT_MS = 1900;
