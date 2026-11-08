import type { FiligreeDbService } from '../../gear/filigree-db.service';
import type { FiligreeLoadout } from '../../gear/filigree';
import type { ShoppingFiligreeLookup } from './shopping-list-entries';
import type { ShoppingSource } from './shopping-list-types';

const WIKI_PAGE_URL = 'https://ddowiki.com/page/';
const WIKI_SEARCH_URL = 'https://ddowiki.com/page/Special:Search?go=Go&search=';
const EVENTS_PACK = 'Events';

/**
 * Where a filigree comes from. A generation's filigrees drop in any chest of its adventure
 * packs, so each pack is one source ("Any Mists of Ravenloft quest") rather than every quest
 * in it; raid filigrees are bought with Threads of Fate; event sets come from events.
 */
export function filigreeSources(filigreeDb: FiligreeDbService, name: string): ShoppingSource[] {
  const found = filigreeDb.getGeneration(name);
  if (!found) {
    return [];
  }
  const { generation } = found;
  if (generation.source) {
    return [{
      quest: generation.source,
      pack: null,
      raid: true,
      wikiUrl: WIKI_PAGE_URL + 'Item:' + generation.source.replace(/ /g, '_'),
    }];
  }
  return generation.packs.map(pack => pack === EVENTS_PACK
    ? { quest: 'Seasonal events', pack, raid: false, wikiUrl: WIKI_SEARCH_URL + encodeURIComponent('Filigree') }
    : { quest: `Any ${pack} quest`, pack, raid: false, wikiUrl: WIKI_SEARCH_URL + encodeURIComponent(pack) });
}

/** The filigree list's row for the filigree's set. */
export function filigreeWikiUrl(filigreeDb: FiligreeDbService, name: string): string {
  const set = filigreeDb.getSets(name)[0];
  return WIKI_PAGE_URL + 'Sentient_Weapon/Filigrees' + (set ? '#' + encodeURIComponent(set.replace(/ /g, '_')) : '');
}

export function shoppingFiligreeLookup(filigreeDb: FiligreeDbService, loadout: FiligreeLoadout): ShoppingFiligreeLookup {
  return {
    loadout,
    sourcesOf: name => filigreeSources(filigreeDb, name),
    wikiUrlOf: name => filigreeWikiUrl(filigreeDb, name),
  };
}
