import type { INodeProperties } from 'n8n-workflow';

import { CHANGE_TYPES } from '../constants';
import {
	additionalJsonField,
	fieldsField,
	fiqlQueryField,
	locatorField,
	operationField,
	personField,
	returnAllFields,
} from './shared';

const show = (operation: string[]) => ({ show: { resource: ['change'], operation } });

/** Fields referencing TOPdesk lists take the name as shown in TOPdesk, or the ID. */
const referenceHint = 'Name as shown in TOPdesk, or the ID';

const changeFields: INodeProperties[] = [
	{ displayName: 'Action', name: 'action', type: 'string', typeOptions: { rows: 4 }, default: '', description: 'Text of the first progress entry' },
	{ displayName: 'Benefit', name: 'benefit', type: 'string', default: '', hint: referenceHint },
	{ displayName: 'Category', name: 'category', type: 'string', default: '', hint: referenceHint },
	{ displayName: 'External Number', name: 'externalNumber', type: 'string', default: '' },
	{ displayName: 'Impact', name: 'impact', type: 'string', default: '', hint: referenceHint },
	{ displayName: 'Priority', name: 'priority', type: 'string', default: '', hint: referenceHint },
	{ displayName: 'Request', name: 'request', type: 'string', typeOptions: { rows: 4 }, default: '' },
	{ displayName: 'Subcategory', name: 'subcategory', type: 'string', default: '', hint: referenceHint },
	{
		displayName: 'Template',
		name: 'template',
		type: 'string',
		default: '',
		placeholder: 'WT 2610 001',
		description: 'Number or ID of a change template. When set, the change type comes from the template.',
	},
	additionalJsonField,
];

export const changeDescription: INodeProperties[] = [
	operationField(
		'change',
		[
			{ name: 'Create', value: 'create', action: 'Create a change' },
			{ name: 'Get', value: 'get', action: 'Get a change' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many changes' },
			{ name: 'Get Progress Trail', value: 'getProgressTrail', action: 'Get the progress trail of a change' },
			{ name: 'Update', value: 'update', action: 'Update a change' },
		],
		'create',
	),
	locatorField({
		displayName: 'Change',
		name: 'changeId',
		searchListMethod: 'searchChanges',
		numberPlaceholder: 'C 2610 001',
		required: true,
		displayOptions: show(['get', 'getProgressTrail', 'update']),
	}),

	// ---------------------------------------------------------------- Create
	personField({ displayName: 'Requester', name: 'requester', required: true, displayOptions: show(['create']) }),
	{
		displayName: 'Brief Description',
		name: 'briefDescription',
		type: 'string',
		required: true,
		default: '',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Change Type',
		name: 'changeType',
		type: 'options',
		options: CHANGE_TYPES,
		default: 'simple',
		displayOptions: show(['create']),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['create']),
		options: changeFields,
	},

	// ---------------------------------------------------------------- Update
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show(['update']),
		options: [
			{ displayName: 'Brief Description', name: 'briefDescription', type: 'string', default: '' },
			{ displayName: 'External Number', name: 'externalNumber', type: 'string', default: '' },
			{
				displayName: 'Patch Operations (JSON)',
				name: 'patch',
				type: 'json',
				default: '[]',
				description:
					'Further changes as JSON Patch, e.g. [{"op": "replace", "path": "/optionalFields1/text1", "value": "abc"}]',
			},
		],
	},

	// ---------------------------------------------------------------- Get Many / progress trail
	...returnAllFields(show(['getAll', 'getProgressTrail'])),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			{
				displayName: 'Brief Description',
				name: 'briefDescription',
				type: 'string',
				default: '',
				description: 'Brief description contains this text',
			},
			{ displayName: 'Created After', name: 'createdAfter', type: 'dateTime', default: '' },
			{ displayName: 'Created Before', name: 'createdBefore', type: 'dateTime', default: '' },
			{
				displayName: 'Modified Since',
				name: 'modifiedSince',
				type: 'dateTime',
				default: '',
				description: 'Only changes modified at or after this time',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: show(['getAll']),
		options: [
			fieldsField,
			fiqlQueryField,
			{
				displayName: 'Sort',
				name: 'sort',
				type: 'options',
				options: [
					{ name: 'Created Ascending', value: 'creationDate:asc' },
					{ name: 'Created Descending', value: 'creationDate:desc' },
					{ name: 'Modified Ascending', value: 'modificationDate:asc' },
					{ name: 'Modified Descending', value: 'modificationDate:desc' },
				],
				default: 'creationDate:desc',
			},
		],
	},
];
