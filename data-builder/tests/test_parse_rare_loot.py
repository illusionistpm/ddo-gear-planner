from bs4 import BeautifulSoup

from parse_rare_loot import get_rare_loot_from_page


def test_get_rare_loot_from_page_collects_paginated_category_items():
    html = '''
    <div id="mw-pages">
      <a href="/page/Item:Heartshard" title="Item:Heartshard">Heartshard</a>
      <a href="/page/Item:Legendary_Heartshard" title="Item:Legendary Heartshard">Legendary Heartshard</a>
      <a href="/page/Other_Page" title="Other Page">Other Page</a>
    </div>
    '''
    soup = BeautifulSoup(html, 'html.parser')

    assert get_rare_loot_from_page(soup) == {'Heartshard', 'Legendary Heartshard'}
