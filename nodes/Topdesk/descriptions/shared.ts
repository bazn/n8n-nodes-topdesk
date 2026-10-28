import type { IDisplayOptions, INodeCredentialDescription, INodeProperties, INodePropertyOptions } from 'n8n-workflow';

const UUID_REGEX = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
const UUID_PLACEHOLDER = '00000000-0000-0000-0000-000000000000';

export const LOAD_OPTIONS_DESCRIPTION =
	'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>';

interface LocatorOptions {
	displayName: string;
	name: string;
	searchListMethod: string;
	description?: string;
	required?: boolean;
	displayOptions?: IDisplayOptions;
	/** Placeholder of the "By Number" mode; without it the locator has no such mode. */
	numberPlaceholder?: string;
}

/** Resource locator for a TOPdesk record: pick from a searchable list, enter its UUID or (optionally) its number. */
export function locatorField(options: LocatorOptions): INodeProperties {
	return {
		displayName: options.displayName,
		name: options.name,
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: options.required,
		description: options.description,
		displayOptions: options.displayOptions,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				typeOptions: { searchListMethod: options.searchListMethod, searchable: true },
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: UUID_PLACEHOLDER,
				validation: [{ type: 'regex', properties: { regex: UUID_REGEX, errorMessage: 'Not a valid ID (UUID)' } }],
			},
			...(options.numberPlaceholder
				? [{ displayName: 'By Number', name: 'number', type: 'string' as const, placeholder: options.numberPlaceholder }]
				: []),
		],
	};
}

export function incidentField(options: Omit<LocatorOptions, 'searchListMethod' | 'numberPlaceholder'>): INodeProperties {
	return locatorField({ ...options, searchListMethod: 'searchIncidents', numberPlaceholder: 'I 2610 123' });
}

export function personField(options: Omit<LocatorOptions, 'searchListMethod'>): INodeProperties {
	return locatorField({ ...options, searchListMethod: 'searchPersons' });
}

export function operatorField(options: Omit<LocatorOptions, 'searchListMethod'>): INodeProperties {
	return locatorField({ ...options, searchListMethod: 'searchOperators' });
}

/** Options field backed by a load options method, named "… Name or ID" as n8n requires. */
export function optionsField(
	displayName: string,
	name: string,
	loadOptionsMethod: string,
	extra: Partial<INodeProperties> = {},
): INodeProperties {
	return {
		displayName: `${displayName} Name or ID`,
		name,
		type: 'options',
		typeOptions: { loadOptionsMethod },
		default: '',
		description: LOAD_OPTIONS_DESCRIPTION,
		...extra,
	} as INodeProperties;
}

/** Operation selector; `options` are listed alphabetically as the n8n lint rules require. */
export function operationField(resource: string, options: INodePropertyOptions[], defaultValue: string): INodeProperties {
	return {
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: [resource] } },
		options,
		default: defaultValue,
	};
}

export function returnAllFields(displayOptions: IDisplayOptions): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions,
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: {
				...displayOptions,
				show: { ...displayOptions.show, returnAll: [false] },
			},
		},
	];
}

/** Raw FIQL query, combined with the filters by AND. */
export const fiqlQueryField: INodeProperties = {
	displayName: 'Query (FIQL)',
	name: 'query',
	type: 'string',
	default: '',
	placeholder: 'briefDescription==*printer*;closed==false',
	description:
		'Further conditions in FIQL as in the <a href="https://developers.topdesk.com/explorer/?page=incident#/incident/get_incidents">TOPdesk API reference</a>. <code>;</code> means AND, <code>,</code> means OR.',
};

export const fieldsField: INodeProperties = {
	displayName: 'Fields',
	name: 'fields',
	type: 'string',
	default: '',
	placeholder: 'number,briefDescription,processingStatus',
	description: 'Comma-separated list of fields to return. Empty returns all fields.',
};

/** Request body as raw JSON, merged over the fields (for attributes the node does not offer). */
export const additionalJsonField: INodeProperties = {
	displayName: 'Additional Fields (JSON)',
	name: 'additionalJson',
	type: 'json',
	default: '{}',
	description:
		'Further API attributes as in the TOPdesk API reference, e.g. {"optionalFields1": {"text1": "abc"}}. They override the fields above.',
};

export const topdeskCredentials: INodeCredentialDescription[] = [{ name: 'topdeskApi', required: true }];
