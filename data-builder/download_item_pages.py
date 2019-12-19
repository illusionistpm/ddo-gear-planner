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
    itemPages = [s['href'] for s in links if '/page/Category' in s['href']]
    return itemPages


def download_page(url):
    filename = url.split(':')[-1]
    path = 'cache/' + filename + '.html'
    if os.path.exists(path):
        print(filename + " already exists")
        return False

    print("Downloading " + filename)
    page = requests.get("http://ddowiki.com" + url)
    open(path, 'w', encoding='utf8').write(page.text)

    return True


def get_items_from_page(itemPageURL):
    page = requests.get(itemPageURL)

    soup = BeautifulSoup(page.content, 'html.parser')

    title = soup.find(id='firstHeading').getText()


itemPageURLs = get_item_page_urls()
for url in set(itemPageURLs):
    if download_page(url):
        pause = random.random() * 10
        print("Sleeping for " + str(pause) + " seconds")
        time.sleep(pause)