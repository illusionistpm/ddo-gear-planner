# ddo-gear-planner

## Initial Setup
1. Install Python
1. Install VSCode
1. Install node.js
1. `npm install -g @angular/cli`
1. Clone this repo
1. `pip install -r data-builder/requirements.txt`
1. `python -m playwright install chromium`

## Build the data
The latest assets are included in the repo, along with the wiki pages they were built from (`wiki-snapshot/`). If you change a parser, rebuild them from those pages and commit `data/` with your change:
* From `data-builder`, run `python build.py --offline` (or `winpty python build.py --offline` if using Git Bash)

To download the current wiki pages instead, run `python build.py --clear-snapshot`. The nightly Data Auto Updater does this, so you rarely need to.

## Start the debug server
* From `site/`, run `ng serve`

## License
* **Code** is licensed under the [MIT License](LICENSE).
* **Game data** in [`data/`](data/) is derived from [DDO Wiki](https://ddowiki.com) and is licensed under [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/), the same license as the wiki. See [`data/LICENSE`](data/LICENSE).

If you build on this project or reuse its data, a link back to [ddo-gear-planner.com](https://ddo-gear-planner.com) or [this repository](https://github.com/illusionistpm/ddo-gear-planner) is appreciated, though not required.
