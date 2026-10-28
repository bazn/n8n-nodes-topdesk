import type {
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IPollFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import { INCIDENT_STATUSES } from '../Topdesk/constants';
import { fiqlQueryField, optionsField, topdeskCredentials } from '../Topdesk/descriptions/shared';
import {
	buildQuery,
	equalsCondition,
	type FiqlCondition,
	rowsOf,
	timestampMs,
	toFiqlDateTime,
	topdeskApiRequest,
	topdeskApiRequestAllItems,
} from '../Topdesk/GenericFunctions';
import { listSearch, loadOptions } from '../Topdesk/methods';

interface PollState {
	/** Newest creation or modification time seen (milliseconds). */
	lastMs?: number;
	/** `id@time` of the incidents already emitted in the second of `lastMs`, to avoid duplicates on the `>=` boundary. */
	lastKeys?: string[];
	/** Event the state belongs to; switching it restarts from "now". */
	key?: string;
}

const MAX_ITEMS_PER_POLL = 1000;

/** Field of the incident that decides whether it is new for the chosen event. */
const TIME_FIELD: Record<string, string> = {
	created: 'creationDate',
	updated: 'modificationDate',
};

export class TopdeskTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TOPdesk Trigger',
		name: 'topdeskTrigger',
		icon: { light: 'file:../Topdesk/topdesk.svg', dark: 'file:../Topdesk/topdesk.dark.svg' },
		group: ['trigger'],
		version: [1],
		subtitle: '={{"Incident " + $parameter["event"]}}',
		description: 'Starts the workflow when incidents are created or changed in TOPdesk',
		defaults: {
			name: 'TOPdesk Trigger',
		},
		polling: true,
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: topdeskCredentials,
		properties: [
			{
				displayName: 'Event',
				name: 'event',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Incident Created', value: 'created', description: 'A new incident was created' },
					{
						name: 'Incident Created or Updated',
						value: 'updated',
						description: 'An incident was created or changed (including new actions)',
					},
				],
				default: 'created',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				options: [
					optionsField('Category', 'category', 'getCategories'),
					optionsField('Operator Group', 'operatorGroup', 'getOperatorGroups'),
					optionsField('Processing Status', 'processingStatus', 'getProcessingStatuses', {
						description: 'Only incidents that have this processing status when the trigger checks',
					}),
					fiqlQueryField,
					{ displayName: 'Status (Line)', name: 'status', type: 'options', options: INCIDENT_STATUSES, default: 'firstLine' },
					{
						displayName: 'Without Closed Incidents',
						name: 'excludeClosed',
						type: 'boolean',
						default: false,
						description: 'Whether closed incidents are ignored',
					},
				],
			},
		],
	};

	methods = { listSearch, loadOptions };

	async poll(this: IPollFunctions): Promise<INodeExecutionData[][] | null> {
		const event = this.getNodeParameter('event') as string;
		const field = TIME_FIELD[event];
		const filters = this.getNodeParameter('filters', {}) as IDataObject;
		const conditions = filterConditions(filters);
		const state = this.getWorkflowStaticData('node') as PollState;
		const hasPosition = state.key === event && state.lastMs !== undefined;

		const fetchNewest = async () =>
			rowsOf(
				await topdeskApiRequest.call(this, 'GET', 'incidents', undefined, {
					...queryOf(conditions, filters.query),
					sort: `${field}:desc`,
					pageStart: 0,
					pageSize: 1,
				}),
			)[0];

		if (this.getMode() === 'manual') {
			// A manual run never moves the stored position: it shows what the active trigger has not
			// delivered yet, or else the newest incident as sample.
			if (hasPosition) {
				const { fresh } = await fetchSince.call(this, field, conditions, filters.query, state);
				if (fresh.length) return [this.helpers.returnJsonArray(fresh)];
			}
			const newest = await fetchNewest();
			return newest ? [this.helpers.returnJsonArray([newest])] : null;
		}

		if (!hasPosition) {
			// First activation: start from the newest existing incident instead of emitting the history.
			const newest = await fetchNewest();
			state.key = event;
			state.lastMs = newest ? timestampMs(newest[field]) || Date.now() : Date.now();
			state.lastKeys = newest ? [incidentKey(newest, field)] : [];
			return null;
		}

		const { rows, fresh } = await fetchSince.call(this, field, conditions, filters.query, state);
		if (rows.length) {
			const position = nextPosition(rows, field, state);
			state.lastMs = position.lastMs;
			state.lastKeys = position.lastKeys;
		}
		return fresh.length ? [this.helpers.returnJsonArray(fresh)] : null;
	}
}

export function filterConditions(filters: IDataObject): FiqlCondition[] {
	return [
		...equalsCondition('category.id', filters.category),
		...equalsCondition('operatorGroup.id', filters.operatorGroup),
		...equalsCondition('processingStatus.id', filters.processingStatus),
		...equalsCondition('status', filters.status),
		...(filters.excludeClosed ? [{ field: 'closed', operator: '==', value: 'false' }] : []),
	];
}

function queryOf(conditions: FiqlCondition[], rawQuery: unknown): IDataObject {
	const query = buildQuery(conditions, rawQuery);
	return query ? { query } : {};
}

/** Identifies one state of an incident, so a later change of the same incident counts as new. */
export function incidentKey(row: IDataObject, field: string): string {
	return `${String(row.id)}@${timestampMs(row[field])}`;
}

/** Start of the second a timestamp falls into; FIQL compares whole seconds. */
function secondOf(ms: number): number {
	return Math.floor(ms / 1000) * 1000;
}

/** Position after a poll: the newest time seen and the keys of everything emitted in its second. */
export function nextPosition(
	rows: IDataObject[],
	field: string,
	state: PollState,
): { lastMs: number; lastKeys: string[] } {
	const newest = Math.max(state.lastMs ?? 0, ...rows.map((row) => timestampMs(row[field])));
	const boundary = secondOf(newest);
	const keys = rows.filter((row) => timestampMs(row[field]) >= boundary).map((row) => incidentKey(row, field));
	const previous = secondOf(state.lastMs ?? 0) === boundary ? (state.lastKeys ?? []) : [];
	return { lastMs: newest, lastKeys: [...new Set([...previous, ...keys])] };
}

/** Incidents at or after the stored position, oldest first; `fresh` excludes the ones already emitted. */
async function fetchSince(
	this: IPollFunctions,
	field: string,
	conditions: FiqlCondition[],
	rawQuery: unknown,
	state: PollState,
): Promise<{ rows: IDataObject[]; fresh: IDataObject[] }> {
	const since = toFiqlDateTime(secondOf(state.lastMs as number));
	const rows = await topdeskApiRequestAllItems.call(
		this,
		'incidents',
		{ ...queryOf([...conditions, { field, operator: '=ge=', value: since }], rawQuery), sort: `${field}:asc` },
		MAX_ITEMS_PER_POLL,
	);
	rows.sort((left, right) => timestampMs(left[field]) - timestampMs(right[field]));
	const seen = new Set(state.lastKeys ?? []);
	const fresh = rows.filter((row) => !seen.has(incidentKey(row, field)));
	return { rows, fresh };
}
