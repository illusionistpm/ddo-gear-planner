# Visual diff harness

Before/after screenshots of the planner, for changes that should look like
nothing happened — the CSS token sweep it was built for, and any later
refactor of markup or styles.

```sh
pip install -r requirements.txt
playwright install chromium          # once

cd site && npx ng serve --port 4300  # in another terminal

python capture.py shots/baseline     # before your change
# ...make the change...
python capture.py shots/after
python compare.py shots/baseline shots/after
```

`compare.py` exits non-zero and writes highlighted images to
`shots/after/diff/` if anything differs. **The expected result is zero
differing pixels.** A diff is a defect to explain, not noise to triage.

## Running it without tripping over the dev server

- **Pick a port that isn't 4200.** That one is usually already taken by a dev
  server you're running yourself; `ng serve` exits with "Port 4200 is already in
  use" rather than sharing it.
- **Let the rebuild finish before capturing.** Editing CSS while a capture is
  starting makes the page reload mid-run, and the capture aborts with no
  screenshots. Wait for "Application bundle generation complete", then capture.
- **`ng serve` outlives the shell that started it.** Stopping a background task
  kills the wrapper, not node. Stop it by port:
  `Get-NetTCPConnection -LocalPort 4300 -State Listen | %{ Stop-Process -Id $_.OwningProcess -Force }`
- Check the server is serving *your* build before trusting a zero-diff:
  `curl -s http://localhost:4300/main.js | grep -c <a symbol you just added>`

## What it captures

15 scenes (`capture.py`'s `SCENES`), each in light and dark, at each of three
viewports: empty and richly-populated builds, both tracked-affix group modes,
hover states, the filters panel, the share menu, all three drawers, an item
preview and the affix builder. Add a scene there when a state isn't covered.

Each scene gets a fresh browser context with localStorage seeded (theme,
active tab, onboarding), animations disabled, and the data-build timestamp
masked, then loads a pinned build URL. The app keeps all build state in the
URL, so a pinned URL pins the content.

### Viewports

`desktop` 1440x900, `tablet` 768x1024, `mobile` 375x812 - the last two with
touch emulated, or the `(pointer: coarse)` rules that size tap targets don't
apply. All three by default, 90 screenshots; narrow it while iterating with
`--viewport desktop`.

They aren't three sizes of the same layout. The page chrome restacks below
768px (icon-only brand, the utility controls behind one button, the filter
chips replaced by a count) and the two compact rails stop rendering below
992px, so a desktop-only run says nothing about either.

## When zero-diff is the goal

Only for a change that is *meant* to look like nothing happened. A change that
deliberately alters the layout can't be gated this way - capture before and
after anyway, but read the diffs rather than counting them, and expect the
count to be large.

## Limits

- **Machine-local.** Font rasterisation and GPU compositing differ across
  machines, so a baseline is only valid for before/after on one box. Don't
  commit the PNGs or use them as a CI gate (`shots/` is gitignored).
- **Only what it drives.** Anything not scripted is unguarded. Known gaps: the
  pinned build never produces the `BetterThanBest`, `BestTied`, `Penalty` or
  `Mixed` affix-rank classes, so rules for those are unverified here.
- **Signed out.** Auth0 is out of scope, so My Builds, the save dialog and
  short links are captured in their signed-out form only.
