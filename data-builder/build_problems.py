"""What a data build reports to Discord: only problems.

A clean build posts nothing. A build that fails posts why. One that succeeds
posts its problems:

- validator errors and unresolved item sources, every night until they're
  fixed - each one is something wrong on the site;
- validator warnings only when the build adds them. There are hundreds of
  long-standing ones (mostly duplicate affixes), and repeating them nightly
  would bury everything else.
"""
import os

import requests

from validate_data import format_issue

# Discord rejects a message over 2000 characters.
DISCORD_MESSAGE_LIMIT = 2000
MAX_LISTED = 15


def _issue_key(issue):
    return (issue['severity'], issue['category'], issue['item'], issue['affix'], issue['issue'])


def new_warnings(before, after):
    """Warnings in `after` that `before` didn't have."""
    known = {_issue_key(issue) for issue in before}
    return [issue for issue in after if issue['severity'] == 'warning' and _issue_key(issue) not in known]


def describe_problems(issues_before, issues_after, unresolved_sources):
    """The build's problems, as Markdown sections; empty when there are none."""
    sections = []

    errors = [issue for issue in issues_after if issue['severity'] == 'error']
    if errors:
        sections.append(_section(
            f"Validation errors ({len(errors)}; run validate_data.py for the full report)",
            [format_issue(issue) for issue in errors]))

    warnings = new_warnings(issues_before, issues_after)
    if warnings:
        sections.append(_section(
            f"New validation warnings ({len(warnings)})",
            [format_issue(issue) for issue in warnings]))

    if unresolved_sources:
        sections.append(_section(
            'Unresolved sources (the site shows them as free until data-builder/source_packs.json names their pack)',
            sorted(unresolved_sources)))

    return sections


def _section(heading, lines):
    listed = [f" - {line}" for line in lines[:MAX_LISTED]]
    if len(lines) > MAX_LISTED:
        listed.append(f" - ...and {len(lines) - MAX_LISTED} more")
    return f"{heading}:\n" + '\n'.join(listed)


def get_run_url():
    """This GitHub Actions run's page, or None outside Actions."""
    server = os.environ.get('GITHUB_SERVER_URL')
    repository = os.environ.get('GITHUB_REPOSITORY')
    run_id = os.environ.get('GITHUB_RUN_ID')
    if not (server and repository and run_id):
        return None
    return f"{server}/{repository}/actions/runs/{run_id}"


def format_message(title, sections, run_url=None):
    footer = f"\n\n<{run_url}>" if run_url else ''
    body = f"**{title}**"
    if sections:
        body += '\n\n' + '\n\n'.join(sections)
    room = DISCORD_MESSAGE_LIMIT - len(footer)
    if len(body) > room:
        body = body[:room - 1] + '…'
    return body + footer


def post_to_discord(url, title, sections):
    message = format_message(title, sections, get_run_url())
    try:
        response = requests.post(url, data={'content': message}, timeout=30)
        response.raise_for_status()
    except requests.RequestException as e:
        # Reporting a problem must not become one.
        print(f"Couldn't post to Discord: {e}")
