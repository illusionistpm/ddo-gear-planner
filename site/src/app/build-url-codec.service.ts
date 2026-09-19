import { Injectable } from '@angular/core';
import { deflate, inflate } from 'pako';

import { perfStart } from './perf-trace';
import urlCodecDictionary from 'src/assets/url-codec-dictionary.json';

type QueryParamValue = string | number | boolean | Array<string | number | boolean>;
type QueryParamRecord = Record<string, QueryParamValue>;
type DecodedParamRecord = Record<string, string | Array<string>>;
type DictionaryKey = 'itemTypes' | 'packs' | 'craftingSystems';
type DictionaryValue = string | number;
type DictionarySetValue = string | string[];

// No version field here: the URL prefix (COMPACT_URL_PREFIX, "z1.") already
// carries the format/version, so a future incompatible payload shape just
// gets a new prefix ("z2.") rather than a field inside the payload itself -
// putting it in both places would be redundant.
export interface CompactPayloadV1 {
  f?: {
    l?: string;
    r?: boolean;
    rr?: boolean;
    ht?: DictionarySetValue;
    hp?: DictionarySetValue;
  };
  g?: Record<string, string>;
  ml?: Record<string, string>;
  c?: Array<[string, DictionaryValue, string]>;
  t?: string[];
  /**
   * Non-gear affix entries (EquippedService.ExternalAffixEntry), positionally
   * encoded as [affixName, bonusType, kind ('v'|'i'), value, label]. The
   * entry's `id` isn't carried - it's only meaningful within a session, so a
   * fresh sequential id is assigned on decode.
   */
  e?: Array<[string, string, string, number, string]>;
  x?: DecodedParamRecord;
}

export interface BuildUrlInspection {
  format: 'compact' | 'unsupported' | 'invalid';
  payloadChars: number;
  compactPayload?: CompactPayloadV1;
  decodedParams?: DecodedParamRecord;
  inflatedJson?: string;
  error?: string;
}

const COMPACT_URL_PREFIX = 'z1.';

const SLOT_TO_CODE: Record<string, string> = {
  Weapon: 'w',
  Offhand: 'o',
  Armor: 'a',
  Belt: 'b',
  Boots: 'bt',
  Bracers: 'br',
  Cloak: 'c',
  Gloves: 'g',
  Goggles: 'gg',
  Helm: 'h',
  Necklace: 'n',
  Ring1: 'r1',
  Ring2: 'r2',
  Trinket: 't',
  Quiver: 'q'
};

const CODE_TO_SLOT = Object.keys(SLOT_TO_CODE)
  .reduce((accum: Record<string, string>, slot) => {
    accum[SLOT_TO_CODE[slot]] = slot;
    return accum;
  }, {});

const KNOWN_FILTER_KEYS = new Set(['levelrange', 'raids', 'rare', 'hiddentypes', 'hiddenpacks']);

const URL_CODEC_DICTIONARY = urlCodecDictionary as {
  version: number;
  itemTypes: string[];
  packs: string[];
  craftingSystems: string[];
  aliases?: {
    itemTypes?: Record<string, string>;
    packs?: Record<string, string>;
    craftingSystems?: Record<string, string>;
  };
};

const DICTIONARY_INDEXES: Record<DictionaryKey, Map<string, number>> = {
  itemTypes: new Map(URL_CODEC_DICTIONARY.itemTypes.map((name, index) => [name, index])),
  packs: new Map(URL_CODEC_DICTIONARY.packs.map((name, index) => [name, index])),
  craftingSystems: new Map(URL_CODEC_DICTIONARY.craftingSystems.map((name, index) => [name, index]))
};

@Injectable({
  providedIn: 'root'
})
export class BuildUrlCodecService {
  encode(params: QueryParamRecord | null | undefined): string {
    const payload = this.paramsToPayload(params || {});
    const json = JSON.stringify(payload);
    const done = perfStart('BuildUrlCodecService.encode');

    try {
      const rawBytes = new TextEncoder().encode(json);
      const deflated = deflate(rawBytes, { level: 9 });
      const base64url = this.bytesToBase64Url(deflated);
      const encoded = COMPACT_URL_PREFIX + base64url;

      done({
        rawJsonBytes: rawBytes.length,
        deflatedBytes: deflated.length,
        base64urlChars: base64url.length,
        finalParamChars: encoded.length,
        compressionRatio: Number((deflated.length / rawBytes.length).toFixed(3)),
        keyCounts: this.getPayloadKeyCounts(payload)
      });

      return encoded;
    } catch (err) {
      done({ failure: this.describeError(err) });
      throw err;
    }
  }

  decode(encoded: string | null | undefined): DecodedParamRecord | null {
    const done = perfStart('BuildUrlCodecService.decode');
    if (!encoded || !encoded.startsWith(COMPACT_URL_PREFIX)) {
      done({ failure: 'missing-or-unsupported-prefix', payloadChars: encoded ? encoded.length : 0 });
      return null;
    }

    const base64url = encoded.slice(COMPACT_URL_PREFIX.length);
    try {
      const deflated = this.base64UrlToBytes(base64url);
      const inflated = inflate(deflated);
      const json = new TextDecoder().decode(inflated);
      const payload = JSON.parse(json) as CompactPayloadV1;

      if (!payload) {
        done({ failure: 'empty-payload', payloadChars: encoded.length });
        return null;
      }

      const params = this.payloadToParams(payload);
      done({
        payloadChars: encoded.length,
        inflatedJsonBytes: new TextEncoder().encode(json).length,
        decodedKeyCounts: this.getDecodedKeyCounts(params)
      });
      return params;
    } catch (err) {
      done({ failure: this.describeError(err), payloadChars: encoded.length });
      return null;
    }
  }

  inspect(encoded: string | null | undefined): BuildUrlInspection {
    if (!encoded || !encoded.startsWith(COMPACT_URL_PREFIX)) {
      return {
        format: 'unsupported',
        payloadChars: encoded ? encoded.length : 0,
        error: 'Missing or unsupported compact URL prefix'
      };
    }

    try {
      const base64url = encoded.slice(COMPACT_URL_PREFIX.length);
      const deflated = this.base64UrlToBytes(base64url);
      const inflated = inflate(deflated);
      const inflatedJson = new TextDecoder().decode(inflated);
      const compactPayload = JSON.parse(inflatedJson) as CompactPayloadV1;

      if (!compactPayload) {
        return {
          format: 'invalid',
          payloadChars: encoded.length,
          inflatedJson,
          error: 'Empty compact URL payload'
        };
      }

      return {
        format: 'compact',
        payloadChars: encoded.length,
        compactPayload,
        decodedParams: this.payloadToParams(compactPayload),
        inflatedJson
      };
    } catch (err) {
      return {
        format: 'invalid',
        payloadChars: encoded.length,
        error: this.describeError(err)
      };
    }
  }

  private paramsToPayload(params: QueryParamRecord): CompactPayloadV1 {
    const payload: CompactPayloadV1 = {};
    const filterPayload: CompactPayloadV1['f'] = {};
    const gearPayload: Record<string, string> = {};
    const minLevelPayload: Record<string, string> = {};
    const craftingPayload: Array<[string, DictionaryValue, string]> = [];
    const unknownPayload: DecodedParamRecord = {};
    const craftingByIndex = new Map<number, Record<string, string>>();

    for (const key of Object.keys(params)) {
      if (key === 'b') {
        continue;
      }

      const value = params[key];
      if (value === undefined || value === null) {
        continue;
      }

      const values = this.valueToStrings(value);
      if (!values.length || values.every(entry => entry === '')) {
        continue;
      }

      if (key === 'levelrange') {
        filterPayload.l = values[0];
      } else if (key === 'raids') {
        filterPayload.r = values[0] === 'true';
      } else if (key === 'rare') {
        filterPayload.rr = values[0] === 'true';
      } else if (key === 'hiddentypes') {
        filterPayload.ht = this.encodeDictionarySet(this.listParamToArray(values), 'itemTypes');
      } else if (key === 'hiddenpacks') {
        filterPayload.hp = this.encodeDictionarySet(this.listParamToArray(values), 'packs');
      } else if (SLOT_TO_CODE[key]) {
        gearPayload[SLOT_TO_CODE[key]] = values[0];
      } else if (key.startsWith('ml_')) {
        const slot = key.slice(3);
        minLevelPayload[SLOT_TO_CODE[slot] || slot] = values[0];
      } else if (key === 'tracked') {
        payload.t = values;
      } else if (key === 'nongear') {
        const encoded = this.encodeExternalAffixes(values[0]);
        if (encoded.length) {
          payload.e = encoded;
        }
      } else if (key.startsWith('craft_')) {
        this.collectCraftingParam(craftingByIndex, key, values[0]);
      } else if (!KNOWN_FILTER_KEYS.has(key)) {
        unknownPayload[key] = values.length === 1 ? values[0] : values;
      }
    }

    for (const index of Array.from(craftingByIndex.keys()).sort((left, right) => left - right)) {
      const craftingParam = craftingByIndex.get(index);
      if (!craftingParam || !craftingParam.slot || !craftingParam.system || !craftingParam.selected) {
        continue;
      }
      craftingPayload.push([
        SLOT_TO_CODE[craftingParam.slot] || craftingParam.slot,
        this.encodeDictionaryValue(craftingParam.system, 'craftingSystems'),
        craftingParam.selected
      ]);
    }

    if (Object.keys(filterPayload).length) {
      payload.f = filterPayload;
    }
    if (Object.keys(gearPayload).length) {
      payload.g = gearPayload;
    }
    if (Object.keys(minLevelPayload).length) {
      payload.ml = minLevelPayload;
    }
    if (craftingPayload.length) {
      payload.c = craftingPayload;
    }
    if (Object.keys(unknownPayload).length) {
      payload.x = unknownPayload;
    }

    return payload;
  }

  private payloadToParams(payload: CompactPayloadV1): DecodedParamRecord {
    const params: DecodedParamRecord = {};

    if (payload.f) {
      if (payload.f.l !== undefined) params.levelrange = payload.f.l;
      if (payload.f.r !== undefined) params.raids = String(payload.f.r);
      if (payload.f.rr !== undefined) params.rare = String(payload.f.rr);
      if (payload.f.ht) params.hiddentypes = this.decodeDictionarySet(payload.f.ht, 'itemTypes').join(',');
      if (payload.f.hp) params.hiddenpacks = this.decodeDictionarySet(payload.f.hp, 'packs').join(',');
    }

    if (payload.g) {
      for (const [code, itemName] of Object.entries(payload.g)) {
        params[CODE_TO_SLOT[code] || code] = itemName;
      }
    }

    if (payload.ml) {
      for (const [code, minLevel] of Object.entries(payload.ml)) {
        params['ml_' + (CODE_TO_SLOT[code] || code)] = minLevel;
      }
    }

    if (payload.c) {
      payload.c.forEach((craftingParam, index) => {
        const slot = CODE_TO_SLOT[craftingParam[0]] || craftingParam[0];
        params[`craft_${index}_slot`] = slot;
        params[`craft_${index}_system`] = this.decodeDictionaryValue(craftingParam[1], 'craftingSystems') || '';
        params[`craft_${index}_selected`] = craftingParam[2];
      });
    }

    if (payload.t?.length) {
      params.tracked = payload.t;
    }

    if (payload.e?.length) {
      params.nongear = this.decodeExternalAffixes(payload.e);
    }

    if (payload.x) {
      for (const [key, value] of Object.entries(payload.x)) {
        params[key] = value;
      }
    }

    return params;
  }

  private collectCraftingParam(craftingByIndex: Map<number, Record<string, string>>, key: string, value: string) {
    const parts = key.split('_');
    if (parts.length !== 3) {
      return;
    }

    const index = Number(parts[1]);
    if (!Number.isFinite(index)) {
      return;
    }

    let craftingParam = craftingByIndex.get(index);
    if (!craftingParam) {
      craftingParam = {};
      craftingByIndex.set(index, craftingParam);
    }
    craftingParam[parts[2]] = value;
  }

  private encodeExternalAffixes(raw: string): Array<[string, string, string, number, string]> {
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed
        .filter((entry): entry is { affixName: string; bonusType: string; kind: string; value: number; label: string } =>
          !!entry && typeof entry.affixName === 'string' && typeof entry.bonusType === 'string'
          && (entry.kind === 'value' || entry.kind === 'ignored')
          && typeof entry.value === 'number' && typeof entry.label === 'string')
        .map((entry): [string, string, string, number, string] =>
          [entry.affixName, entry.bonusType, entry.kind === 'ignored' ? 'i' : 'v', entry.value, entry.label]);
    } catch {
      return [];
    }
  }

  private decodeExternalAffixes(entries: Array<[string, string, string, number, string]>): string {
    const decoded = entries.map((entry, index) => ({
      id: String(index + 1),
      affixName: entry[0],
      bonusType: entry[1],
      kind: entry[2] === 'i' ? 'ignored' : 'value',
      value: entry[3],
      label: entry[4]
    }));
    return JSON.stringify(decoded);
  }

  private listParamToArray(values: string[]) {
    return values
      .flatMap(value => value.split(','))
      .filter(value => value !== '');
  }

  private valueToStrings(value: QueryParamValue): string[] {
    const values = Array.isArray(value) ? value : [value];
    return values.map(entry => String(entry));
  }

  private encodeDictionaryValue(value: string, dictionaryKey: DictionaryKey): DictionaryValue {
    const index = DICTIONARY_INDEXES[dictionaryKey];
    const canonicalValue = this.getDictionaryCanonicalValue(value, dictionaryKey);
    return index.has(canonicalValue) ? index.get(canonicalValue) as number : canonicalValue;
  }

  private decodeDictionaryValue(value: DictionaryValue, dictionaryKey: DictionaryKey): string | null {
    const dictionary = URL_CODEC_DICTIONARY[dictionaryKey];
    const decodedValue = typeof value === 'number' ? dictionary[value] : value;
    return decodedValue ? this.getDictionaryCanonicalValue(decodedValue, dictionaryKey) : null;
  }

  private encodeDictionarySet(values: string[], dictionaryKey: DictionaryKey): DictionarySetValue {
    const unknownValues: string[] = [];
    let bitfield = 0n;

    for (const value of values) {
      const encodedValue = this.encodeDictionaryValue(value, dictionaryKey);
      if (typeof encodedValue === 'number') {
        bitfield |= 1n << BigInt(encodedValue);
      } else {
        unknownValues.push(encodedValue);
      }
    }

    const bitfieldText = bitfield.toString(36);
    return unknownValues.length ? [bitfieldText, ...unknownValues] : bitfieldText;
  }

  private decodeDictionarySet(value: DictionarySetValue, dictionaryKey: DictionaryKey): string[] {
    if (Array.isArray(value)) {
      return [
        ...this.decodeDictionaryBitfield(value[0] || '0', dictionaryKey),
        ...value.slice(1)
          .map(entry => this.getDictionaryCanonicalValue(entry, dictionaryKey))
          .filter((entry): entry is string => !!entry)
      ];
    }

    return this.decodeDictionaryBitfield(value, dictionaryKey);
  }

  private decodeDictionaryBitfield(bitfieldText: string, dictionaryKey: DictionaryKey): string[] {
    let bitfield = this.parseBase36BigInt(bitfieldText);
    const dictionary = URL_CODEC_DICTIONARY[dictionaryKey];
    const values: string[] = [];
    let index = 0;

    while (bitfield > 0n) {
      if (bitfield & 1n) {
        const decodedValue = dictionary[index];
        if (decodedValue) {
          values.push(this.getDictionaryCanonicalValue(decodedValue, dictionaryKey));
        }
      }
      bitfield >>= 1n;
      index++;
    }

    return values;
  }

  private parseBase36BigInt(value: string) {
    let result = 0n;
    for (const char of value.toLowerCase()) {
      const digit = parseInt(char, 36);
      if (!Number.isFinite(digit) || digit < 0 || digit >= 36) {
        return 0n;
      }
      result = result * 36n + BigInt(digit);
    }
    return result;
  }

  private getDictionaryCanonicalValue(value: string, dictionaryKey: DictionaryKey): string {
    return URL_CODEC_DICTIONARY.aliases?.[dictionaryKey]?.[value] || value;
  }

  private bytesToBase64Url(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
    }

    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  private base64UrlToBytes(base64url: string): Uint8Array {
    const base64 = base64url
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(base64url.length / 4) * 4, '=');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private getPayloadKeyCounts(payload: CompactPayloadV1) {
    return {
      filters: payload.f ? Object.keys(payload.f).length : 0,
      gear: payload.g ? Object.keys(payload.g).length : 0,
      minLevels: payload.ml ? Object.keys(payload.ml).length : 0,
      crafting: payload.c ? payload.c.length : 0,
      tracked: payload.t ? payload.t.length : 0,
      external: payload.e ? payload.e.length : 0,
      unknown: payload.x ? Object.keys(payload.x).length : 0
    };
  }

  private getDecodedKeyCounts(params: DecodedParamRecord) {
    return {
      keys: Object.keys(params).length,
      repeatedValues: Object.values(params).reduce((count, value) =>
        count + (Array.isArray(value) ? value.length : 1), 0)
    };
  }

  private describeError(err: unknown) {
    return err instanceof Error ? err.message : String(err);
  }
}
