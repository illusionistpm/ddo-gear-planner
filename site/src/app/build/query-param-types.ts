// Kept apart from query-params.service so build-url-codec.service, which that
// service imports, can use these without an import cycle.

export type QueryParamValue = string | number | boolean | Array<string | number | boolean>;
export type QueryParamRecord = Record<string, QueryParamValue>;
