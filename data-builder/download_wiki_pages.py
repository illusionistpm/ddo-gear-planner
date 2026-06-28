from bs4 import BeautifulSoup
import requests
import os
import shutil
import time
from pathlib import Path

USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
DEFAULT_HEADERS = {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9'
}

def _create_requests_session_from_playwright(full_url, timeout=30):
    print(f"Starting Playwright cookie harvest for {full_url}")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise RuntimeError('Playwright is not installed. Install it to use the playwright cookie backend.') from e

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=USER_AGENT,
            ignore_https_errors=True,
            extra_http_headers=DEFAULT_HEADERS,
        )
        page = context.new_page()
        page.goto(full_url, wait_until='domcontentloaded', timeout=timeout * 1000)
        page.wait_for_timeout(7000)
        html = page.content()
        cookies = context.cookies()
        page.close()
        browser.close()

    if _looks_like_waf_challenge(html):
        raise RuntimeError(f'Playwright challenge page still detected at {full_url}')

    session = requests.Session()
    session.headers.update({'User-Agent': USER_AGENT, **DEFAULT_HEADERS})
    for cookie in cookies:
        session.cookies.set(cookie['name'], cookie['value'],
                            domain=cookie.get('domain'),
                            path=cookie.get('path', '/'))
    print(f"Completed cookie harvest from Playwright; {len(cookies)} cookies set")
    return session


def get_item_page_urls(session=None):
    url = 'https://ddowiki.com/page/Items'
    headers = {'User-Agent': USER_AGENT, **DEFAULT_HEADERS}
    if session is None:
        session = requests.Session()
        session.headers.update(headers)
        resp = session.get(url, timeout=30)
    else:
        resp = session.get(url, timeout=30)

    resp.raise_for_status()
    soup = BeautifulSoup(resp.content, 'html.parser')

    content = soup.find(id='mw-content-text')
    if content is None:
        raise RuntimeError('Unable to find Items page content while collecting item page URLs')

    links = content.find_all('a', href=True)
    itemPages = sorted({
        s['href'].split('/page/')[1]
        for s in links
        if '/page/Category:' in s['href']
    })

    if 'Category:Quiver_items' not in itemPages:
        itemPages.append('Category:Quiver_items')

    return itemPages


def get_item_type_urls():
    return [
        'Basic_light_weapons',
        'Basic_one-handed_weapons',
        'Basic_two-handed_weapons',
        'Basic_ranged_weapons',
        'Basic_thrown_weapons'
        ]


def _looks_like_waf_challenge(html):
    return any(token in html for token in [
        'awsWafCookieDomainList',
        'window.gokuProps',
        'challenge.js',
        'AWSWAF'
    ])


def _download_html_with_requests(full_url, session=None, timeout=30):
    headers = {'User-Agent': USER_AGENT, **DEFAULT_HEADERS}
    if session is None:
        session = requests.Session()
    session.headers.update(headers)
    page = session.get(full_url, timeout=timeout)
    page.raise_for_status()
    if page.status_code != 200:
        raise ValueError(f"Unexpected status {page.status_code} from {full_url}")
    if not page.text.strip():
        raise ValueError(f"Empty response from {full_url} (status {page.status_code})")
    if _looks_like_waf_challenge(page.text):
        raise ValueError(f"Detected WAF challenge page from {full_url}")
    return page.text


def _download_html_with_playwright(full_url, timeout=30):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise RuntimeError('Playwright is not installed. Install it to use the playwright backend.') from e

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent=USER_AGENT,
            ignore_https_errors=True,
            extra_http_headers=DEFAULT_HEADERS,
        )
        page = context.new_page()
        page.goto(full_url, wait_until='domcontentloaded', timeout=timeout * 1000)
        page.wait_for_timeout(3000)
        html = page.content()
        if _looks_like_waf_challenge(html):
            page.wait_for_timeout(7000)
            html = page.content()
        page.close()
        browser.close()

    if not html.strip():
        raise ValueError(f"Empty response from {full_url} using playwright")
    if _looks_like_waf_challenge(html):
        raise ValueError(f"Detected WAF challenge page after playwright navigation for {full_url}")
    return html


def _download_html(full_url, use_playwright=False, session=None, timeout=30):
    if use_playwright:
        return _download_html_with_playwright(full_url, timeout=timeout)
    return _download_html_with_requests(full_url, session=session, timeout=timeout)


def download_page(url, cacheDir, max_retries=3, retry_delay_seconds=10, session=None):
    filename = url.split(':')[-1].replace("/","_")
    path = cacheDir + filename + '.html'
    if os.path.exists(path):
        print(f"Using cached {filename}.html")
        return False

    full_url = "https://ddowiki.com/index.php?DPL_offset=0&DPL_refresh=yes&title=" + url

    for attempt in range(1, max_retries + 1):
        print(f"Downloading {filename} from {full_url} (attempt {attempt}/{max_retries}) using requests")
        try:
            html = _download_html(full_url, session=session, timeout=30)
        except ValueError as e:
            if 'Detected WAF challenge page' in str(e):
                print(f"Detected WAF challenge for {filename}; retrying with playwright.")
                html = _download_html(full_url, use_playwright=True, timeout=30)
            else:
                if attempt < max_retries:
                    print(f"{e} while downloading {filename}, retrying in {retry_delay_seconds}s...")
                    time.sleep(retry_delay_seconds)
                    continue
                raise
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if e.response is not None else None
            if status_code is not None and 500 <= status_code < 600 and attempt < max_retries:
                print(f"HTTP {status_code} while downloading {filename}, retrying in {retry_delay_seconds}s...")
                time.sleep(retry_delay_seconds)
                continue
            raise
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout, RuntimeError) as e:
            if attempt < max_retries:
                print(f"{e} while downloading {filename}, retrying in {retry_delay_seconds}s...")
                time.sleep(retry_delay_seconds)
                continue
            raise

        open(path, 'w', encoding='utf8').write(html)
        return True

    return False


def download_item_pages(session=None):
    cacheDir = 'cache/items/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    itemPageURLs = get_item_page_urls(session=session)
    print(f'Found {len(itemPageURLs)} item page URLs to download')
    for url in sorted(set(itemPageURLs)):
        download_page(url, cacheDir, session=session)


def download_item_type_pages(session=None):
    cacheDir = 'cache/item_types/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    itemPageURLs = get_item_type_urls()
    for url in set(itemPageURLs):
        download_page(url, cacheDir, session=session)


def download_minor_artifacts_page(session=None):
    cacheDir = 'cache/minor_artifacts/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Category:Minor_Artifacts', cacheDir, session=session)


def download_set_page(session=None):
    cacheDir = 'cache/sets/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Raw data/Sets v2', cacheDir, session=session)


def download_item_augments_page(session=None):
    cacheDir = 'cache/item_augments/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Raw data/Item augments', cacheDir, session=session)


def download_quest_pages(session=None):
    cacheDir = 'cache/quests/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Raids', cacheDir, session=session)


def download_crafting_pages(session=None):
    cacheDir = 'cache/crafting/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Raw data/Item crafting enchantments', cacheDir, session=session)


def download_wiki_pages():
    print('Using download backend: requests-with-playwright-cookie')
    session = _create_requests_session_from_playwright('https://ddowiki.com/index.php?DPL_offset=0&DPL_refresh=yes&title=Raw data/Sets v2')

    download_item_pages(session=session)
    download_item_type_pages(session=session)
    download_minor_artifacts_page(session=session)
    download_set_page(session=session)
    download_item_augments_page(session=session)
    download_quest_pages(session=session)
    download_crafting_pages(session=session)


def clear_wiki_cache():
    path = Path('cache')
    if path.exists() and path.is_dir():
        shutil.rmtree('cache')


if __name__ == "__main__":
    download_wiki_pages()