import type { INodePropertyOptions } from 'n8n-workflow';

/** Line of an incident; partial incidents belong to a main incident. */
export const INCIDENT_STATUSES: INodePropertyOptions[] = [
	{ name: 'First Line', value: 'firstLine' },
	{ name: 'Second Line', value: 'secondLine' },
	{ name: 'Partial', value: 'partial', description: 'Partial incident of a main incident (needs Main Incident)' },
];

export const CHANGE_TYPES: INodePropertyOptions[] = [
	{ name: 'Simple', value: 'simple' },
	{ name: 'Extensive', value: 'extensive' },
];

/** Sort fields of the incident list (`sort=field:asc|desc`). */
export const INCIDENT_SORT_FIELDS = ['callDate', 'creationDate', 'modificationDate', 'targetDate', 'closedDate', 'number'];

export const INCIDENT_SORT_OPTIONS: INodePropertyOptions[] = INCIDENT_SORT_FIELDS.flatMap((field) => [
	{ name: `${field} Ascending`, value: `${field}:asc` },
	{ name: `${field} Descending`, value: `${field}:desc` },
]);

/** Incident fields that reference other TOPdesk records and are sent as `{ id }`. */
export const INCIDENT_REFERENCES = [
	'callType',
	'entryType',
	'category',
	'subcategory',
	'impact',
	'urgency',
	'priority',
	'duration',
	'processingStatus',
	'operatorGroup',
	'operator',
	'closureCode',
	'branch',
	'object',
	'location',
	'supplier',
	'sla',
];

export const INCIDENT_DATE_FIELDS = ['callDate', 'targetDate', 'onHoldDate', 'completedDate', 'closedDate'];

/** Person fields that reference other TOPdesk records and are sent as `{ id }`. */
export const PERSON_REFERENCES = ['branch', 'department', 'location', 'budgetHolder', 'personExtraFieldA', 'personExtraFieldB'];
