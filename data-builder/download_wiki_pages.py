from bs4 import BeautifulSoup
import requests
import os
import shutil
import time
from pathlib import Path

def get_item_page_urls():
    page = requests.get('https://ddowiki.com/page/Items')

    soup = BeautifulSoup(page.content, 'html.parser')

    table = soup.find(id='mw-content-text').contents[0].contents[0]
    links = table.find_all('a', href=True)
    itemPages = [s['href'].split('/page/')[1] for s in links if '/page/Category' in s['href']]

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


def download_page(url, cacheDir, max_retries=3, retry_delay_seconds=10):
    filename = url.split(':')[-1].replace("/","_")
    path = cacheDir + filename + '.html'
    if os.path.exists(path):
        print(f"Using cached {filename}.html")
        return False

    # https://ddowiki.com/index.php?DPL_offset=0&DPL_refresh=yes&title=Category:Cloth_armor
    full_url = "http://ddowiki.com/index.php?DPL_offset=0&DPL_refresh=yes&title=" + url

    for attempt in range(1, max_retries + 1):
        print(f"Downloading {filename} from {full_url} (attempt {attempt}/{max_retries})")
        try:
            page = requests.get(full_url)
            page.raise_for_status()
            open(path, 'w', encoding='utf8').write(page.text)
            return True
        except requests.exceptions.HTTPError as e:
            status_code = e.response.status_code if e.response is not None else None
            # Retry on server-side errors like 5xx, including 504 timeouts
            if status_code is not None and 500 <= status_code < 600 and attempt < max_retries:
                print(f"HTTP {status_code} while downloading {filename}, retrying in {retry_delay_seconds}s...")
                time.sleep(retry_delay_seconds)
                continue
            raise
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout):
            if attempt < max_retries:
                print(f"Connection issue while downloading {filename}, retrying in {retry_delay_seconds}s...")
                time.sleep(retry_delay_seconds)
                continue
            raise

    return False


def download_item_pages():
    cacheDir = 'cache/items/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    itemPageURLs = get_item_page_urls()
    for url in set(itemPageURLs):
        download_page(url, cacheDir)


def download_item_type_pages():
    cacheDir = 'cache/item_types/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    itemPageURLs = get_item_type_urls()
    for url in set(itemPageURLs):
        download_page(url, cacheDir)


def download_minor_artifacts_page():
    cacheDir = 'cache/minor_artifacts/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Category:Minor_Artifacts', cacheDir)


def download_set_page():
    cacheDir = 'cache/sets/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Raw data/Sets v2', cacheDir)


def download_item_augments_page():
    cacheDir = 'cache/item_augments/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Raw data/Item augments', cacheDir)


def download_quest_pages():
    cacheDir = 'cache/quests/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Raids', cacheDir)


def download_crafting_pages():
    cacheDir = 'cache/crafting/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Raw data/Item crafting enchantments', cacheDir)


def download_wiki_pages():
    download_item_pages()
    download_item_type_pages()
    download_minor_artifacts_page()
    download_set_page()
    download_item_augments_page()
    download_quest_pages()
    download_crafting_pages()


def clear_wiki_cache():
    path = Path('cache')
    if path.exists() and path.is_dir():
        shutil.rmtree('cache')


if __name__ == "__main__":
    download_wiki_pages()