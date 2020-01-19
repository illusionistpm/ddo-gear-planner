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


def download_page(url):
    filename = url.split(':')[-1]
    path = 'cache/' + filename + '.html'
    if os.path.exists(path):
        print(filename + " already exists")
        return False

    #https://ddowiki.com/index.php?DPL_offset=0&DPL_refresh=yes&title=Category:Cloth_armor
    print("Downloading " + filename)
    page = requests.get("http://ddowiki.com/index.php?DPL_offset=0&DPL_refresh=yes&title=" + url)
    open(path, 'w', encoding='utf8').write(page.text)

    return True

if not os.path.exists('cache'):
    os.makedirs('cache')

itemPageURLs = get_item_page_urls()
for url in set(itemPageURLs):
    if download_page(url):
        pause = random.random() * 10
        print("Sleeping for " + str(pause) + " seconds")
        time.sleep(pause)