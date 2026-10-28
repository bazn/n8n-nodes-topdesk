import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeParameterResourceLocator,
	IPollFunctions,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError, sleep } from 'n8n-workflow';

export type TopdeskContext = IExecuteFunctions | ILoadOptionsFunctions | IPollFunctions;

export const CREDENTIAL_TYPE = 'topdeskApi';

/**
 * TOPdesk list endpoints page in two ways: the newer ones (incidents, changes) with `pageStart`/`pageSize`,
 * the older ones (persons, operators, operator groups, actions) with `start`/`page_size` and at most 100 rows.
 */
export type PagingStyle = 'pageStart' | 'start';

export const MAX_PAGE_SIZE: Record<PagingStyle, number> = {
	pageStart: 1000,
	start: 100,
};

/** `https://acme.topdesk.net/tas/api/` or `acme.topdesk.net` → `https://acme.topdesk.net`. */
export function normalizeUrl(url: string): string {
	const trimmed = String(url ?? '').trim();
	const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
	return withProtocol.replace(/\/+$/, '').replace(/\/tas(\/api)?$/i, '');
}

/** Address of the TOPdesk environment (without `/tas/api`), from the credential. */
export async function getHost(this: TopdeskContext): Promise<string> {
	const credentials = await this.getCredentials<{ url: string }>(CREDENTIAL_TYPE);
	return normalizeUrl(credentials.url);
}

/** TOPdesk answers 429 when too many requests are sent at once. */
const RATE_LIMIT_STATUS = 429;
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 60_000;

interface ErrorLike {
	httpCode?: string;
	response?: { status?: number; headers?: IDataObject; body?: unknown; data?: unknown };
	cause?: { response?: { status?: number; headers?: IDataObject; data?: unknown } };
}

export function statusOf(error: unknown): number | undefined {
	const candidate = error as ErrorLike;
	const status = candidate.httpCode ?? candidate.response?.status ?? candidate.cause?.response?.status;
	return status === undefined ? undefined : Number(status);
}

/** Wait time before retrying a rate-limited request, from the `Retry-After` header (seconds). */
export function rateLimitWaitMs(error: unknown, attempt: number): number {
	const candidate = error as ErrorLike;
	const headers = candidate.response?.headers ?? candidate.cause?.response?.headers ?? {};
	const retryAfter = Number(headers['retry-after'] ?? headers['Retry-After']);
	const ms = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 1000;
	return Math.min(ms, MAX_RATE_LIMIT_WAIT_MS);
}

/**
 * Builds a readable message from TOPdesk's error bodies. Depending on the endpoint they are
 * `[{ message }]`, `{ errors: [{ errorCode, message }] }` or `{ message }`.
 */
export function extractTopdeskMessage(error: unknown): string | undefined {
	const candidate = error as ErrorLike;
	let body = candidate.response?.body ?? candidate.response?.data ?? candidate.cause?.response?.data;
	if (typeof body === 'string') {
		try {
			body = JSON.parse(body) as unknown;
		} catch {
			return undefined;
		}
	}
	if (!body || typeof body !== 'object') return undefined;
	const entries = Array.isArray(body) ? body : ((body as { errors?: unknown }).errors ?? [body]);
	const messages = (Array.isArray(entries) ? entries : [entries])
		.map((entry) => {
			if (typeof entry === 'string') return entry;
			if (!entry || typeof entry !== 'object') return undefined;
			const { message, errorCode, field } = entry as { message?: unknown; errorCode?: unknown; field?: unknown };
			if (message === undefined) return undefined;
			const prefix = field ? `${String(field)}: ` : '';
			return errorCode && !String(message).includes(String(errorCode))
				? `${prefix}${String(message)} (${String(errorCode)})`
				: `${prefix}${String(message)}`;
		})
		.filter((message): message is string => Boolean(message));
	return messages.length ? messages.join('; ') : undefined;
}

/**
 * Request with the TOPdesk credential. `endpoint` is relative to `/tas/api` (e.g. `incidents/id/…`),
 * an absolute path below the host (`/tas/api/…`) or a full URL. Rate-limited requests are retried.
 */
export async function topdeskApiRequest(
	this: TopdeskContext,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject | IDataObject[],
	qs: IDataObject = {},
	extra: Partial<IHttpRequestOptions> = {},
): Promise<unknown> {
	const host = await getHost.call(this);
	let url: string;
	if (/^https?:\/\//i.test(endpoint)) {
		url = endpoint;
	} else if (endpoint.startsWith('/tas/')) {
		url = `${host}${endpoint}`;
	} else {
		url = `${host}/tas/api/${endpoint.replace(/^\/+/, '')}`;
	}
	const options: IHttpRequestOptions = {
		method,
		url,
		qs,
		json: true,
		headers: { Accept: 'application/json' },
		...extra,
	};
	if (body !== undefined) {
		options.body = body;
	}

	for (let attempt = 0; ; attempt++) {
		try {
			return await this.helpers.httpRequestWithAuthentication.call(this, CREDENTIAL_TYPE, options);
		} catch (error) {
			if (statusOf(error) === RATE_LIMIT_STATUS && attempt < MAX_RATE_LIMIT_RETRIES) {
				await sleep(rateLimitWaitMs(error, attempt));
				continue;
			}
			throw new NodeApiError(this.getNode(), error as JsonObject, { message: extractTopdeskMessage(error) });
		}
	}
}

/**
 * Rows of a list response. TOPdesk answers an array, `{ results, next }` (changes) or an empty body
 * with HTTP 204 when nothing matches.
 */
export function rowsOf(response: unknown): IDataObject[] {
	if (Array.isArray(response)) return response as IDataObject[];
	if (response && typeof response === 'object' && Array.isArray((response as IDataObject).results)) {
		return (response as { results: IDataObject[] }).results;
	}
	return [];
}

/**
 * Pages through a list endpoint. Pass `limit` to stop after that many rows, or omit it to fetch every page.
 */
export async function topdeskApiRequestAllItems(
	this: TopdeskContext,
	endpoint: string,
	qs: IDataObject = {},
	limit?: number,
	paging: PagingStyle = 'pageStart',
): Promise<IDataObject[]> {
	const maxPageSize = MAX_PAGE_SIZE[paging];
	const pageSize = limit ? Math.min(limit, maxPageSize) : maxPageSize;
	const [startKey, sizeKey] = paging === 'pageStart' ? ['pageStart', 'pageSize'] : ['start', 'page_size'];
	const results: IDataObject[] = [];
	for (let start = 0; ; start += pageSize) {
		const response = await topdeskApiRequest.call(this, 'GET', endpoint, undefined, {
			...qs,
			[startKey]: start,
			[sizeKey]: pageSize,
		});
		const rows = rowsOf(response);
		results.push(...rows);
		const hasNext =
			response && typeof response === 'object' && !Array.isArray(response)
				? Boolean((response as IDataObject).next)
				: rows.length >= pageSize;
		if (!hasNext || rows.length === 0 || (limit !== undefined && results.length >= limit)) break;
	}
	return limit !== undefined ? results.slice(0, limit) : results;
}

// ---------------------------------------------------------------- FIQL queries

/** Characters that may stand unquoted in a FIQL value; everything else is quoted. */
const PLAIN_FIQL_VALUE = /^[A-Za-z0-9_.:+\-*@]+$/;

/** Quotes a value for a FIQL query when it contains spaces or reserved characters. */
export function fiqlValue(value: unknown): string {
	const text = String(value);
	return PLAIN_FIQL_VALUE.test(text) ? text : `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export interface FiqlCondition {
	field: string;
	operator: string;
	value: unknown;
}

/** One FIQL comparison; `in`/`out` take comma-separated lists. */
export function fiqlCondition({ field, operator, value }: FiqlCondition): string {
	if (operator === '=in=' || operator === '=out=') {
		const values = (Array.isArray(value) ? value : String(value).split(','))
			.map((entry) => String(entry).trim())
			.filter((entry) => entry !== '');
		return `${field}${operator}(${values.map(fiqlValue).join(',')})`;
	}
	return `${field}${operator}${fiqlValue(value)}`;
}

/** Comparison for a text filter (contains, using `*` wildcards), or nothing when the filter is empty. */
export function containsCondition(field: string, value: unknown): FiqlCondition[] {
	return value === undefined || value === null || value === '' ? [] : [{ field, operator: '==', value: `*${String(value)}*` }];
}

/** Exact comparison (also resolves resource locators), or nothing when the filter is empty. */
export function equalsCondition(field: string, value: unknown): FiqlCondition[] {
	const resolved = resolveLocatorValue(value);
	return resolved === undefined ? [] : [{ field, operator: '==', value: resolved }];
}

/** Date comparison (`=ge=`, `=lt=` …) in the format TOPdesk expects, or nothing when the filter is empty. */
export function dateCondition(field: string, operator: string, value: unknown): FiqlCondition[] {
	const date = toFiqlDateTime(value);
	return date === undefined ? [] : [{ field, operator, value: date }];
}

/** Combines conditions and an optional raw FIQL query with AND (`;`). Returns undefined when empty. */
export function buildQuery(conditions: FiqlCondition[], rawQuery?: unknown): string | undefined {
	const parts = conditions.map(fiqlCondition);
	const raw = typeof rawQuery === 'string' ? rawQuery.trim() : '';
	if (raw) parts.push(parts.length ? `(${raw})` : raw);
	return parts.length ? parts.join(';') : undefined;
}

// ---------------------------------------------------------------- Dates

/** TOPdesk timestamps (`2026-03-01T10:15:30.000+0000`) as milliseconds; 0 when not parseable. */
export function timestampMs(value: unknown): number {
	const text = String(value ?? '')
		.trim()
		.replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
	const ms = Date.parse(text);
	return Number.isNaN(ms) ? 0 : ms;
}

/** Any date or date-time → `2026-03-01T10:15:30Z` (UTC, whole seconds) for FIQL queries. */
export function toFiqlDateTime(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const ms = typeof value === 'number' ? value : timestampMs(value);
	if (!ms) return String(value);
	return new Date(Math.floor(ms / 1000) * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Any date or date-time → `2026-03-01T10:15:30.000+0000`, the format of TOPdesk request bodies. */
export function toTopdeskDateTime(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const ms = timestampMs(value);
	if (!ms) return String(value);
	return new Date(ms).toISOString().replace(/Z$/, '+0000');
}

// ---------------------------------------------------------------- Parameters

/** Reads a value that may be a plain string or a resource locator (e.g. inside a collection). */
export function resolveLocatorValue(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	if (typeof value === 'object' && 'value' in (value as IDataObject)) {
		const inner = (value as INodeParameterResourceLocator).value;
		return inner === undefined || inner === null || String(inner).trim() === '' ? undefined : String(inner).trim();
	}
	return String(value).trim() === '' ? undefined : String(value).trim();
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
	return UUID_PATTERN.test(String(value ?? '').trim());
}

/** Reads a resource locator (or string) parameter and fails with a clear message when it is empty. */
export function getRequiredValue(this: IExecuteFunctions, parameterName: string, itemIndex: number, label: string): string {
	const value = resolveLocatorValue(this.getNodeParameter(parameterName, itemIndex, ''));
	if (value === undefined) {
		throw new NodeOperationError(this.getNode(), `No ${label} given`, { itemIndex });
	}
	return value;
}

/** Reads a resource locator parameter that must hold a TOPdesk UUID. */
export function getUuid(this: IExecuteFunctions, parameterName: string, itemIndex: number, label: string): string {
	const value = getRequiredValue.call(this, parameterName, itemIndex, label);
	if (!isUuid(value)) {
		throw new NodeOperationError(this.getNode(), `"${value}" is not a valid ${label} ID`, {
			itemIndex,
			description: 'TOPdesk IDs are UUIDs like 00000000-0000-0000-0000-000000000000',
		});
	}
	return value;
}

/** Path of an incident by UUID (`incidents/id/…`) or by number (`incidents/number/…`). */
export function incidentPath(idOrNumber: string): string {
	return isUuid(idOrNumber)
		? `incidents/id/${encodeURIComponent(idOrNumber)}`
		: `incidents/number/${encodeURIComponent(idOrNumber)}`;
}

/** Reference to another record: a UUID becomes `{ id }`, anything else `{ name }` (or the given key). */
export function toReference(value: unknown, fallbackKey = 'name'): IDataObject | undefined {
	const resolved = resolveLocatorValue(value);
	if (resolved === undefined) return undefined;
	return isUuid(resolved) ? { id: resolved } : { [fallbackKey]: resolved };
}

/**
 * Converts node parameters to a TOPdesk body. Empty values are dropped, `references` become
 * `{ id }` objects (or `{ name }` for names entered by expression), `dateFields` are formatted.
 */
export function toTopdeskBody(fields: IDataObject, references: string[] = [], dateFields: string[] = []): IDataObject {
	const body: IDataObject = {};
	for (const [key, raw] of Object.entries(fields)) {
		let value: unknown = raw;
		if (value && typeof value === 'object' && !Array.isArray(value) && 'value' in (value as IDataObject)) {
			value = resolveLocatorValue(value);
		}
		if (value === undefined || value === null || value === '') continue;
		if (references.includes(key)) {
			value = toReference(value);
		} else if (dateFields.includes(key)) {
			value = toTopdeskDateTime(value);
		}
		body[key] = value as IDataObject[keyof IDataObject];
	}
	return body;
}

export function parseJsonParameter(
	this: IExecuteFunctions,
	value: unknown,
	parameterName: string,
	itemIndex: number,
): IDataObject {
	if (value === undefined || value === null || value === '') return {};
	if (typeof value === 'object' && !Array.isArray(value)) return value as IDataObject;
	try {
		const parsed = JSON.parse(String(value)) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as IDataObject;
	} catch {
		// handled below
	}
	throw new NodeOperationError(this.getNode(), `"${parameterName}" must be a JSON object`, { itemIndex });
}

/**
 * Turns an "Additional Fields" / "Update Fields" collection into a request body; the raw JSON
 * field is merged last, so it wins.
 */
export function buildBody(
	this: IExecuteFunctions,
	fields: IDataObject,
	itemIndex: number,
	references: string[] = [],
	dateFields: string[] = [],
): IDataObject {
	const { additionalJson, ...rest } = fields;
	return {
		...toTopdeskBody(rest, references, dateFields),
		...parseJsonParameter.call(this, additionalJson, 'Additional Fields (JSON)', itemIndex),
	};
}

/** Returns the limit for Get Many operations, or undefined when all results are requested. */
export function limitFor(this: IExecuteFunctions, itemIndex: number): number | undefined {
	return this.getNodeParameter('returnAll', itemIndex) ? undefined : (this.getNodeParameter('limit', itemIndex) as number);
}

/** Query parameters shared by Get Many operations: the FIQL query, sort order and returned fields. */
export function listQuery(conditions: FiqlCondition[], options: IDataObject): IDataObject {
	const qs: IDataObject = {};
	const query = buildQuery(conditions, options.query);
	if (query) qs.query = query;
	if (options.sort) qs.sort = options.sort;
	if (options.fields) qs.fields = String(options.fields).replace(/\s+/g, '');
	return qs;
}
