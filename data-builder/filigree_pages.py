"""Which wiki pages the filigree parser reads.

The filigree list lives on Sentient_Weapon/Filigrees. Anything it breaks out
onto subpages of Sentient_Weapon (set bonuses, generations) is linked from it,
so the download follows those links one level deep rather than hard-coding
subpage names the wiki may rename.
"""

FILIGREE_PAGE = 'Sentient_Weapon/Filigrees'
SUBPAGE_PREFIX = 'Sentient_Weapon/'
# A guard against a page that suddenly links half the wiki under the prefix.
MAX_SUBPAGES = 40


def get_filigree_subpages(soup):
    """Sentient_Weapon/... pages the filigree page links to, excluding itself, sorted."""
    content = soup.find(id='mw-content-text') or soup
    pages = set()
    for link in content.find_all('a', href=True):
        href = str(link['href'])
        if not href.startswith('/page/'):
            continue
        page = href.split('/page/', 1)[1].split('#', 1)[0]
        if '?' in page or not page.startswith(SUBPAGE_PREFIX) or page == FILIGREE_PAGE:
            continue
        pages.add(page)
    return sorted(pages)[:MAX_SUBPAGES]
