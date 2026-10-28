import type { INodeProperties } from 'n8n-workflow';

export const apiRequestDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['apiRequest'] } },
		options: [
			{
				name: 'Send',
				value: 'send',
				action: 'Send an API request',
				description: 'Call any TOPdesk endpoint with the node credential',
			},
		],
		default: 'send',
	},
	{
		displayName: 'Method',
		name: 'method',
		type: 'options',
		options: ['DELETE', 'GET', 'PATCH', 'POST', 'PUT'].map((method) => ({ name: method, value: method })),
		default: 'GET',
		displayOptions: { show: { resource: ['apiRequest'] } },
	},
	{
		displayName: 'Endpoint',
		name: 'endpoint',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'assetmgmt/assets',
		description: 'Path below /tas/api of your TOPdesk environment',
		displayOptions: { show: { resource: ['apiRequest'] } },
	},
	{
		displayName: 'Query Parameters (JSON)',
		name: 'query',
		type: 'json',
		default: '{}',
		displayOptions: { show: { resource: ['apiRequest'] } },
	},
	{
		displayName: 'Body (JSON)',
		name: 'body',
		type: 'json',
		default: '',
		description: 'Request body; an object or an array (e.g. JSON Patch operations)',
		displayOptions: { show: { resource: ['apiRequest'], method: ['PATCH', 'POST', 'PUT'] } },
	},
	{
		displayName: 'Content Type',
		name: 'contentType',
		type: 'options',
		options: [
			{ name: 'JSON', value: 'application/json' },
			{ name: 'JSON Patch', value: 'application/json-patch+json' },
		],
		default: 'application/json',
		displayOptions: { show: { resource: ['apiRequest'], method: ['PATCH', 'POST', 'PUT'] } },
	},
	{
		displayName: 'Split Array Responses Into Items',
		name: 'splitArray',
		type: 'boolean',
		default: true,
		description:
			'Whether a response that is an array becomes one item per entry. Otherwise the array is returned in the field "data" of one item.',
		displayOptions: { show: { resource: ['apiRequest'] } },
	},
];
