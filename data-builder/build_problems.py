"""What a data build reports to Discord: only problems.

A clean build posts nothing. A build that fails posts why; one that succeeds
posts only what it made worse - validator errors and warnings, and item
sources, that the data from before the build didn't have. Problems that were
already there aren't posted again every night.
"""
import os

import requests

from validate_data import format_issue

# Discord rejects a message over 2000 characters.
DISCORD_MESSAGE_LIMIT = 2000
MAX_LISTED = 15

REPORTED_SEVERITIES = ('error', 'warning')


def _issue_key(issue):
    return (issue['severity'], issue['category'], issue['item'], issue['affix'], issue['issue'])


def new_audit_issues(before, after):
    """Errors and warnings in `after` that `before` didn't have, errors first."""
    known = {_issue_key(issue) for issue in before}
    new = [issue for issue in after
           if issue['severity'] in REPORTED_SEVERITIES and _issue_key(issue) not in known]
    new.sort(key=lambda issue: REPORTED_SEVERITIES.index(issue['severity']))
    return new


def describe_new_problems(issues_before, issues_after, unresolved_before, unresolved_after):
    """Problems this build introduced, as Markdown sections; empty when there are none."""
    sections = []

    issues = new_audit_issues(issues_before, issues_after)
    if issues:
        errors = sum(1 for issue in issues if issue['severity'] == 'error')
        warnings = len(issues) - errors
        sections.append(_section(
            f"New validation issues ({errors} errors, {warnings} warnings; run validate_data.py for the full report)",
            [format_issue(issue) for issue in issues]))

    unresolved = sorted(set(unresolved_after) - set(unresolved_before))
    if unresolved:
        sections.append(_section(
            'New unresolved sources (the site shows them as free until data-builder/source_packs.json names their pack)',
            unresolved))

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
