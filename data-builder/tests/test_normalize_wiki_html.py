import pytest
from bs4 import BeautifulSoup

from normalize_wiki_html import normalize_wiki_html


# The shape of a real ddowiki page, with the per-request values that change
# on every download.
RAW_PAGE = '''<!DOCTYPE html>
<html class="client-nojs" lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
<title>Category:Wrist items - DDO wiki</title>
<script nonce="a1b2c3">RLCONF={"wgRequestId":"5977f457186632640e74b97d","wgBackendResponseTime":443};</script>
</head>
<body class="mediawiki">
<div id="content" class="mw-body" role="main">
<h1 id="firstHeading" class="firstHeading mw-first-heading">Category:Wrist items</h1>
<div id="bodyContent" class="vector-body">
<div id="siteSub" class="noprint">From DDO wiki</div>
<div id="contentSub"></div>
<a class="mw-jump-link" href="#mw-head">Jump to navigation</a>
<div id="mw-content-text" class="mw-body-content"><div class="mw-content-ltr mw-parser-output" lang="en" dir="ltr"><table class="wikitable"><tr><th>Item</th></tr><tr><td><a href="/page/Item:Bracers" title="Item:Bracers">Bracers</a>&nbsp;of the Fang</td></tr></table>
<!--
NewPP limit report
Cached time: 20261025143947
CPU time usage: 2.181 seconds
Real time usage: 2.211 seconds
-->
<!-- Saved in parser cache with key ddowiki:pcache:idhash:124004-0!canonical and timestamp 20261025143947 -->
</div><div class="mw-category-generated" lang="en" dir="ltr"><div id="mw-pages"><a href="/index.php?title=Category:Wrist_items&amp;pagefrom=B" title="Category:Wrist items">next page</a></div></div><div class="printfooter">Retrieved from "https://ddowiki.com/page/Category:Wrist_items"</div></div>
<div id="catlinks" class="catlinks"><a href="/page/Category:Items" title="Category:Items">Items</a></div>
</div>
</div>
<div id="footer"><ul><li id="footer-info-lastmod"> This page was last edited on 25 October 2026, at 14:39.</li></ul></div>
<script nonce="d4e5f6">(RLQ=window.RLQ||[]).push(function(){mw.config.set({"wgBackendResponseTime":443});});</script>
</body>
</html>
'''


def test_keeps_what_the_parsers_read():
    soup = BeautifulSoup(normalize_wiki_html(RAW_PAGE), 'html.parser')

    assert soup.find(id='firstHeading').getText() == 'Category:Wrist items'
    content = soup.find(id='bodyContent').find(id='mw-content-text')
    assert 'mw-parser-output' in content.contents[0]['class']
    assert content.find('table', class_='wikitable').find('a')['title'] == 'Item:Bracers'
    assert content.find(id='mw-pages').find('a').getText() == 'next page'
    assert soup.find(id='catlinks').find('a')['title'] == 'Category:Items'


@pytest.mark.parametrize('noise', [
    'wgRequestId',
    'wgBackendResponseTime',
    'nonce=',
    'NewPP limit report',
    'Cached time',
    'Saved in parser cache',
    'last edited on',
    'Jump to navigation',
])
def test_drops_per_request_noise(noise):
    assert noise not in normalize_wiki_html(RAW_PAGE)


def test_is_idempotent():
    once = normalize_wiki_html(RAW_PAGE)

    assert normalize_wiki_html(once) == once


def test_rejects_a_page_without_article_content():
    with pytest.raises(ValueError):
        normalize_wiki_html('<html><body><p>Request blocked</p></body></html>')
