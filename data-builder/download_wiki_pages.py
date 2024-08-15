from bs4 import BeautifulSoup
import requests
import os
import shutil
import random
import time
from pathlib import Path

def get_item_page_urls():
    page = requests.get('https://ddowiki.com/page/Items')

    soup = BeautifulSoup(page.content, 'html.parser')

    table = soup.find(id='mw-content-text').contents[0].contents[0]
    links = table.find_all('a', href=True)
    itemPages = [s['href'].split('/page/')[1] for s in links if '/page/Category' in s['href']]

    itemPages.append('Category:Quiver_items')
    itemPages.append('Category:Item_augments')

    return itemPages

def get_item_type_urls():
    return [
        'Basic_light_weapons',
        'Basic_one-handed_weapons',
        'Basic_two-handed_weapons',
        'Basic_ranged_weapons',
        'Basic_thrown_weapons'
        ]

def download_page(url, cacheDir):
    filename = url.split(':')[-1]
    path = cacheDir + filename + '.html'
    if os.path.exists(path):
        print(filename + " already exists")
        return False

    #https://ddowiki.com/index.php?DPL_offset=0&DPL_refresh=yes&title=Category:Cloth_armor
    print(f"Downloading {filename} from {url}")
    page = requests.get("http://ddowiki.com/index.php?DPL_offset=0&DPL_refresh=yes&title=" + url)
    open(path, 'w', encoding='utf8').write(page.text)

    return True


def download_item_pages():
    cacheDir = 'cache/items/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    itemPageURLs = get_item_page_urls()
    for url in set(itemPageURLs):
        if download_page(url, cacheDir):
            pause = random.random()
            print("Sleeping for " + str(pause) + " seconds")
            time.sleep(pause)

    download_page('Minor_Artifact', 'cache/')

def download_item_type_pages():
    cacheDir = 'cache/item_types/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    itemPageURLs = get_item_type_urls()
    for url in set(itemPageURLs):
        if download_page(url, cacheDir):
            pause = random.random()
            print("Sleeping for " + str(pause) + " seconds")
            time.sleep(pause)

def download_set_page():
    cacheDir = 'cache/sets/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Named_item_sets', cacheDir)


def download_quest_pages():
    cacheDir = 'cache/quests/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Raids', cacheDir)

def download_crafting_pages():
    cacheDir = 'cache/crafting/'
    if not os.path.exists(cacheDir):
        os.makedirs(cacheDir)

    download_page('Dinosaur_Bone_crafting', cacheDir)

def download_wiki_pages():
    download_item_pages()
    download_item_type_pages()
    download_set_page()
    download_quest_pages()
    download_crafting_pages()

def clear_wiki_cache():
    path = Path('cache')
    if path.exists() and path.is_dir():
        shutil.rmtree('cache')


if __name__ == "__main__":
    download_wiki_pages()