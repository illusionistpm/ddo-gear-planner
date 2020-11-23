from bs4 import BeautifulSoup
import requests
import os
import shutil
import random
import time

def get_item_page_urls():
    page = requests.get('https://ddowiki.com/page/Items')

    soup = BeautifulSoup(page.content, 'html.parser')

    table = soup.find(id='mw-content-text').contents[0].contents[0]
    links = table.find_all('a', href=True)
    itemPages = [s['href'].split('/page/')[1] for s in links if '/page/Category' in s['href']]
    return itemPages


def download_page(url, cacheDir):
    filename = url.split(':')[-1]
    path = cacheDir + filename + '.html'
    if os.path.exists(path):
        print(filename + " already exists")
        return False

    #https://ddowiki.com/index.php?DPL_offset=0&DPL_refresh=yes&title=Category:Cloth_armor
    print("Downloading " + filename)
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
            pause = random.random() * 2
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


def download_wiki_pages():
    download_item_pages()
    download_set_page()
    download_quest_pages()


if __name__ == "__main__":
    download_wiki_pages()