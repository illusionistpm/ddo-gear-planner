from download_wiki_pages import download_wiki_pages
from parse_set_page import parse_set_page
from parse_item_pages import parse_item_pages
from parse_cannith import parse_cannith
from build_affix_groups import build_affix_groups
from build_crafting import build_crafting
from build_synonyms import build_synonyms

download_wiki_pages()

print('#### Download complete. Beginning data build')
parse_set_page()
parse_item_pages()
parse_cannith()

build_affix_groups()
build_synonyms()
build_crafting()
