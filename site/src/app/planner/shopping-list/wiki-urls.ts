/** Links into ddowiki for the shopping list's entries and sources. */
export const WIKI_PAGE_URL = 'https://ddowiki.com/page/';

/** An item's own page; the wiki's search doesn't look in the Item namespace. */
export function wikiItemUrl(name: string): string {
  return WIKI_PAGE_URL + 'Item:' + encodeURIComponent(name.replace(/ /g, '_'));
}

export function wikiSearchUrl(term: string): string {
  return WIKI_PAGE_URL + 'Special:Search?go=Go&search=' + encodeURIComponent(term);
}
