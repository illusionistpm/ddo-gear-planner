"""Reduce a downloaded wiki page to the parts the parsers read.

The snapshot is committed, so anything that changes on every request - the
request id, CSP nonces, parser timing comments, the "last edited" footer, the
skin's scripts - would show up as a diff on every refresh. Those all live
outside the article, so the page is cut down to its heading, its content and
its category links, and comments inside them are dropped. Normalizing a page
twice gives the same result.
"""
from bs4 import BeautifulSoup, Comment

# Inside #bodyContent, in page order. #mw-content-text holds the article and,
# on category pages, #mw-pages with its "next page" link.
KEPT_BODY_IDS = ['mw-content-text', 'catlinks']


def normalize_wiki_html(html: str) -> str:
    soup = BeautifulSoup(html, 'html.parser')

    heading = soup.find(id='firstHeading')
    body = soup.find(id='bodyContent')
    content = body.find(id='mw-content-text') if body else None
    if heading is None or content is None:
        raise ValueError('Not a wiki article page: no #firstHeading or #mw-content-text')

    kept = [element for element in (body.find(id=kept_id) for kept_id in KEPT_BODY_IDS) if element]
    for element in [heading, *kept]:
        for comment in element.find_all(string=lambda text: isinstance(text, Comment)):
            comment.extract()

    page = '\n'.join([
        '<!DOCTYPE html>',
        '<html><body>',
        str(heading),
        '<div id="bodyContent">',
        *(str(element) for element in kept),
        '</div>',
        '</body></html>',
        '',
    ])
    # Dropping comments leaves runs of whitespace-only strings, which parsing
    # collapses. One more round trip makes the result a fixed point.
    return str(BeautifulSoup(page, 'html.parser'))
