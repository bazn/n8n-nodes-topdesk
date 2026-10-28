import type { INodeProperties } from 'n8n-workflow';

import {
	additionalJsonField,
	fieldsField,
	fiqlQueryField,
	operationField,
	operatorField,
	optionsField,
	personField,
	returnAllFields,
} from './shared';

const showFor = (resource: string) => (operation: string[]) => ({ show: { resource: [resource], operation } });

/** Filters shared by persons and operators. */
function nameFilters(label: string): INodeProperties[] {
	return [
		{
			displayName: 'Archived',
			name: 'archived',
			type: 'boolean',
			default: false,
			description: `Whether to return archived ${label} instead of active ones`,
		},
		{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@email.com', default: '', description: 'Email contains this text' },
		{ displayName: 'First Name', name: 'firstName', type: 'string', default: '', description: 'First name contains this text' },
		{ displayName: 'Last Name', name: 'surName', type: 'string', default: '', description: 'Last name contains this text' },
	];
}

const listOptions = (displayOptions: { show: Record<string, string[]> }): INodeProperties => ({
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions,
	options: [fieldsField, fiqlQueryField],
});

// ---------------------------------------------------------------- Person

const showPerson = showFor('person');

const personFields: INodeProperties[] = [
	optionsField('Budget Holder', 'budgetHolder', 'getBudgetHolders'),
	optionsField('Department', 'department', 'getDepartments'),
	{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@email.com', default: '' },
	{ displayName: 'Employee Number', name: 'employeeNumber', type: 'string', default: '' },
	{ displayName: 'First Name', name: 'firstName', type: 'string', default: '' },
	{ displayName: 'Is Manager', name: 'isManager', type: 'boolean', default: false, description: 'Whether the person is a manager' },
	{ displayName: 'Job Title', name: 'jobTitle', type: 'string', default: '' },
	{ displayName: 'Mobile Number', name: 'mobileNumber', type: 'string', default: '' },
	{
		displayName: 'Network Login Name',
		name: 'networkLoginName',
		type: 'string',
		default: '',
		description: 'Login name for single sign-on',
	},
	{ displayName: 'Phone Number', name: 'phoneNumber', type: 'string', default: '' },
	{
		displayName: 'Self-Service Login Name',
		name: 'tasLoginName',
		type: 'string',
		default: '',
		description: 'Login name for the self-service portal',
	},
	additionalJsonField,
];

export const personDescription: INodeProperties[] = [
	operationField(
		'person',
		[
			{ name: 'Archive', value: 'archive', action: 'Archive a person' },
			{ name: 'Create', value: 'create', action: 'Create a person' },
			{ name: 'Get', value: 'get', action: 'Get a person' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many persons' },
			{ name: 'Unarchive', value: 'unarchive', action: 'Unarchive a person' },
			{ name: 'Update', value: 'update', action: 'Update a person' },
		],
		'get',
	),
	personField({
		displayName: 'Person',
		name: 'personId',
		required: true,
		displayOptions: showPerson(['archive', 'get', 'unarchive', 'update']),
	}),
	{
		displayName: 'Last Name',
		name: 'surName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: showPerson(['create']),
	},
	optionsField('Branch', 'branch', 'getBranches', { required: true, displayOptions: showPerson(['create']) }),
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showPerson(['create']),
		options: personFields,
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showPerson(['update']),
		options: [
			optionsField('Branch', 'branch', 'getBranches'),
			{ displayName: 'Last Name', name: 'surName', type: 'string', default: '' },
			...personFields,
		],
	},
	optionsField('Archiving Reason', 'archivingReason', 'getArchivingReasons', {
		displayOptions: showPerson(['archive']),
		hint: 'Required when TOPdesk is set up to ask for an archiving reason',
	}),
	...returnAllFields(showPerson(['getAll'])),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showPerson(['getAll']),
		options: [...nameFilters('persons'), optionsField('Branch', 'branch', 'getBranches')].sort((left, right) =>
			left.displayName.localeCompare(right.displayName),
		),
	},
	listOptions(showPerson(['getAll'])),
];

// ---------------------------------------------------------------- Operator

const showOperator = showFor('operator');

export const operatorDescription: INodeProperties[] = [
	operationField(
		'operator',
		[
			{ name: 'Get', value: 'get', action: 'Get an operator' },
			{ name: 'Get Current', value: 'getCurrent', action: 'Get the current operator', description: 'Operator of the credential' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many operators' },
		],
		'get',
	),
	operatorField({ displayName: 'Operator', name: 'operatorId', required: true, displayOptions: showOperator(['get']) }),
	...returnAllFields(showOperator(['getAll'])),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showOperator(['getAll']),
		options: nameFilters('operators'),
	},
	listOptions(showOperator(['getAll'])),
];

// ---------------------------------------------------------------- Operator group

const showOperatorGroup = showFor('operatorGroup');

export const operatorGroupDescription: INodeProperties[] = [
	operationField(
		'operatorGroup',
		[
			{ name: 'Get', value: 'get', action: 'Get an operator group' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many operator groups' },
			{ name: 'Get Operators', value: 'getOperators', action: 'Get the operators of an operator group' },
		],
		'get',
	),
	optionsField('Operator Group', 'operatorGroupId', 'getOperatorGroups', {
		required: true,
		displayOptions: showOperatorGroup(['get', 'getOperators']),
	}),
	...returnAllFields(showOperatorGroup(['getAll'])),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showOperatorGroup(['getAll']),
		options: [
			{
				displayName: 'Archived',
				name: 'archived',
				type: 'boolean',
				default: false,
				description: 'Whether to return archived operator groups instead of active ones',
			},
			{ displayName: 'Name', name: 'groupName', type: 'string', default: '', description: 'Name contains this text' },
		],
	},
	listOptions(showOperatorGroup(['getAll'])),
];

// ---------------------------------------------------------------- Branch

const showBranch = showFor('branch');

const branchFields: INodeProperties[] = [
	{
		displayName: 'Branch Type',
		name: 'branchType',
		type: 'options',
		options: [
			{ name: 'Has a Head Branch', value: 'hasAHeadBranch' },
			{ name: 'Head Branch', value: 'headBranch' },
			{ name: 'Independent Branch', value: 'independentBranch' },
		],
		default: 'independentBranch',
	},
	{ displayName: 'Client Reference Number', name: 'clientReferenceNumber', type: 'string', default: '' },
	{ displayName: 'Email', name: 'email', type: 'string', placeholder: 'name@email.com', default: '' },
	{ displayName: 'Phone', name: 'phone', type: 'string', default: '' },
	{ displayName: 'Specification', name: 'specification', type: 'string', default: '' },
	{ displayName: 'Website', name: 'website', type: 'string', default: '' },
	additionalJsonField,
];

export const branchDescription: INodeProperties[] = [
	operationField(
		'branch',
		[
			{ name: 'Create', value: 'create', action: 'Create a branch' },
			{ name: 'Get', value: 'get', action: 'Get a branch' },
			{ name: 'Get Many', value: 'getAll', action: 'Get many branches' },
			{ name: 'Update', value: 'update', action: 'Update a branch' },
		],
		'get',
	),
	optionsField('Branch', 'branchId', 'getBranches', { required: true, displayOptions: showBranch(['get', 'update']) }),
	{ displayName: 'Name', name: 'name', type: 'string', required: true, default: '', displayOptions: showBranch(['create']) },
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showBranch(['create']),
		options: branchFields,
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: showBranch(['update']),
		options: [{ displayName: 'Name', name: 'name', type: 'string', default: '' }, ...branchFields],
	},
	...returnAllFields(showBranch(['getAll'])),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: showBranch(['getAll']),
		options: [{ displayName: 'Name', name: 'name', type: 'string', default: '', description: 'Name contains this text' }],
	},
	listOptions(showBranch(['getAll'])),
];
