"""Capture deterministic screenshots of the planner for before/after CSS diffs.

    python capture.py shots/baseline                 # against ng serve --port 4300
    python capture.py shots/after --base-url http://localhost:4299

Every scene loads a pinned build URL into a fresh browser context with
localStorage seeded (theme, active tab, onboarding) and animations off, then
drives the UI into one state and takes a full-page screenshot - once per theme.
The build lives entirely in the URL, so a pinned URL pins the content.

Screenshots are only comparable on the same machine: font rasterisation and
GPU compositing differ elsewhere. Don't commit them as a baseline.
"""
import argparse
import json
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable
from urllib.parse import urlencode

from playwright.sync_api import Page, sync_playwright

VIEWPORT = {'width': 1440, 'height': 900}

# Set pieces from two sets (so set bonuses render), a slot left empty for the
# suggestions drawer, tracked affixes both covered and uncovered, a checklist
# (Bool) affix, and one non-gear entry.
RICH_BUILD = urlencode([
    ('Ring1', 'Black Pearl Ring'),
    ('Helm', 'Explorer of the Depths'),
    ('Goggles', 'Legendary Amethyst Loupe'),
    ('Bracers', 'Adamantine Bracers'),
    ('Armor', 'Chainmail of the First Snow'),
    ('Belt', 'Direwolf Belt'),
    ('tracked', 'Constitution'),
    ('tracked', 'Physical Sheltering'),
    ('tracked', 'Armor Class'),
    ('tracked', 'Fortification'),
    ('tracked', 'Wisdom'),
    ('tracked', 'Doublestrike'),
    ('tracked', 'Eversight'),
    ('nongear', json.dumps([{
        'id': '1', 'affixName': 'Constitution', 'bonusType': 'Insight',
        'kind': 'value', 'value': 2, 'label': 'Past life',
    }])),
])


def click(selector: str) -> Callable[[Page], None]:
    return lambda page: page.locator(selector).first.click()


def hover(selector: str) -> Callable[[Page], None]:
    return lambda page: page.locator(selector).first.hover()


def click_slot(slot: str) -> Callable[[Page], None]:
    return lambda page: (page.locator('app-equipment-slot-card')
                         .filter(has_text=slot).locator('.slot-select-button').first.click())


@dataclass
class Scene:
    name: str
    build: str = RICH_BUILD
    tab: str = 'equipment'
    onboarding_done: bool = True
    steps: list[Callable[[Page], None]] = field(default_factory=list)


SCENES = [
    Scene('empty-onboarding', build='', onboarding_done=False),
    Scene('empty', build=''),
    Scene('equipment'),
    Scene('equipment-hover-affix', steps=[hover('app-gear-description .hover-helper')]),
    Scene('affixes-category', tab='affixes'),
    Scene('affixes-scarcity', tab='affixes', steps=[click('button:has-text("Scarcity")')]),
    Scene('affixes-hover-chip', tab='affixes', steps=[hover('button.tracked-bonus-chip')]),
    Scene('filters', steps=[click('.planner-filter-toggle')]),
    Scene('share-menu', steps=[click('button.build-action-button:has-text("Share")')]),
    Scene('slot-drawer', steps=[click_slot('Weapon')]),
    Scene('bonus-type-drawer', tab='affixes', steps=[click('button.tracked-bonus-chip')]),
    Scene('bonus-type-preview', tab='affixes',
          steps=[click('button.tracked-bonus-chip'), click('app-items-with-bonus-type .item-preview-link')]),
    Scene('set-drawer', steps=[click('.set-link')]),
    Scene('set-preview', steps=[click('.set-link'), click('app-items-in-set .item-preview-link')]),
    Scene('affix-builder', tab='affixes', steps=[click('.tracked-affix-edit-affixes')]),
]

THEMES = ['light', 'dark']

# Runs before any app script on every page load.
SEED_SCRIPT = """
([theme, tab, onboardingDone]) => {
  localStorage.clear();
  localStorage.setItem('ddo-gear-planner-theme', theme);
  localStorage.setItem('ddo-gear-planner-active-tab', tab);
  localStorage.setItem('ddo-planner-onboarding-state-v1',
    JSON.stringify({ completed: onboardingDone, dismissed: onboardingDone }));
  const kill = document.createElement('style');
  kill.textContent = '*, *::before, *::after { animation: none !important; transition: none !important;'
    + ' caret-color: transparent !important; }';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(kill));
}
"""


def settle(page: Page) -> None:
    """Wait out network, fonts, and EquippedService's idle-callback warmup repaints."""
    page.wait_for_load_state('networkidle')
    page.evaluate('document.fonts.ready')
    # Both callbacks need a timeout: some views keep scheduling idle work, so a
    # bare requestIdleCallback may never fire.
    page.evaluate('new Promise(r => requestIdleCallback(() => requestIdleCallback(r, { timeout: 2000 }),'
                  ' { timeout: 2000 }))')
    page.wait_for_timeout(300)


def capture(out_dir: Path, base_url: str, only: set[str]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for scene in SCENES:
            if only and scene.name not in only:
                continue
            for theme in THEMES:
                context = browser.new_context(viewport=VIEWPORT, device_scale_factor=1,
                                              color_scheme=theme, reduced_motion='reduce')
                page = context.new_page()
                page.add_init_script(
                    f'({SEED_SCRIPT})({json.dumps([theme, scene.tab, scene.onboarding_done])})')
                page.goto(f'{base_url}/?{scene.build}' if scene.build else f'{base_url}/')
                page.wait_for_selector('app-main')
                settle(page)
                for step in scene.steps:
                    step(page)
                    settle(page)
                # Moving the mouse would change the page, so hover scenes keep it where it is.
                path = out_dir / f'{scene.name}.{theme}.png'
                page.screenshot(path=str(path), full_page=True, animations='disabled',
                                mask=[page.locator('.filters-meta')])
                print(path.name)
                context.close()
        browser.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('out_dir', type=Path)
    parser.add_argument('--base-url', default='http://localhost:4300')
    parser.add_argument('--only', nargs='*', default=[], help='scene names to capture (default: all)')
    args = parser.parse_args()
    unknown = set(args.only) - {s.name for s in SCENES}
    if unknown:
        sys.exit(f'unknown scenes: {sorted(unknown)}')
    capture(args.out_dir, args.base_url.rstrip('/'), set(args.only))


if __name__ == '__main__':
    main()
