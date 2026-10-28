import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchResult,
	INodePropertyOptions,
} from 'n8n-workflow';

import {
	buildQuery,
	containsCondition,
	type PagingStyle,
	rowsOf,
	topdeskApiRequest,
	topdeskApiRequestAllItems,
} from './GenericFunctions';

const LIST_PAGE_SIZE = 50;

/** Loads a lookup list (`[{ id, name }]`) and turns it into sorted options. */
async function lookup(
	this: ILoadOptionsFunctions,
	endpoint: string,
	name: (row: IDataObject) => string = byName,
	paging?: PagingStyle,
	qs: IDataObject = {},
): Promise<INodePropertyOptions[]> {
	const rows = paging
		? await topdeskApiRequestAllItems.call(this, endpoint, qs, undefined, paging)
		: rowsOf(await topdeskApiRequest.call(this, 'GET', endpoint, undefined, qs));
	return rows
		.map((row) => ({ name: name(row), value: row.id as string }))
		.sort((left, right) => left.name.localeCompare(right.name));
}

const byName = (row: IDataObject) => String(row.name ?? row.id);

export const loadOptions = {
	async getCallTypes(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/call_types');
	},
	async getEntryTypes(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/entry_types');
	},
	async getCategories(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/categories');
	},
	async getSubcategories(this: ILoadOptionsFunctions) {
		// subcategories carry their category; the name shows both, as the same name may exist twice
		return lookup.call(this, 'incidents/subcategories', (row) => {
			const category = (row.category as IDataObject | undefined)?.name;
			return category ? `${String(category)} › ${String(row.name)}` : byName(row);
		});
	},
	async getImpacts(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/impacts');
	},
	async getUrgencies(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/urgencies');
	},
	async getPriorities(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/priorities');
	},
	async getDurations(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/durations');
	},
	async getProcessingStatuses(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/statuses');
	},
	async getClosureCodes(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/closure_codes');
	},
	async getEscalationReasons(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/escalation-reasons');
	},
	async getDeescalationReasons(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'incidents/deescalation-reasons');
	},
	async getArchivingReasons(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'archiving-reasons');
	},
	async getOperatorGroups(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'operatorgroups', (row) => String(row.groupName ?? row.id), 'start');
	},
	async getBranches(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'branches', byName, undefined, { fields: 'id,name' });
	},
	async getDepartments(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'departments');
	},
	async getBudgetHolders(this: ILoadOptionsFunctions) {
		return lookup.call(this, 'budgetholders');
	},
};

interface ListSearchSpec {
	endpoint: string;
	paging: PagingStyle;
	/** Fields matched with "contains" against the user's text, combined with OR. */
	fields: string[];
	name: (row: IDataObject) => string;
	value?: (row: IDataObject) => string;
	qs?: IDataObject;
}

/** Searchable list for resource locators. */
async function listSearchRows(
	this: ILoadOptionsFunctions,
	spec: ListSearchSpec,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const start = paginationToken ? Number(paginationToken) : 0;
	const [startKey, sizeKey] = spec.paging === 'pageStart' ? ['pageStart', 'pageSize'] : ['start', 'page_size'];
	const qs: IDataObject = { ...spec.qs, [startKey]: start, [sizeKey]: LIST_PAGE_SIZE };
	if (filter) {
		// a comma joins FIQL comparisons with OR
		const query = spec.fields.map((field) => buildQuery(containsCondition(field, filter))).join(',');
		qs.query = spec.qs?.query ? `${String(spec.qs.query)};(${query})` : query;
	}
	const response = await topdeskApiRequest.call(this, 'GET', spec.endpoint, undefined, qs);
	const rows = rowsOf(response);
	const more =
		response && typeof response === 'object' && !Array.isArray(response)
			? Boolean((response as IDataObject).next)
			: rows.length === LIST_PAGE_SIZE;
	return {
		results: rows.map((row) => ({ name: spec.name(row), value: spec.value?.(row) ?? String(row.id) })),
		paginationToken: more ? String(start + LIST_PAGE_SIZE) : undefined,
	};
}

const nameOf = (value: unknown) => (value as IDataObject | undefined)?.name;

function personName(row: IDataObject): string {
	const name = String(row.dynamicName ?? (`${row.firstName ?? ''} ${row.surName ?? ''}`.trim() || row.id));
	return row.email ? `${name} (${String(row.email)})` : name;
}

export const listSearch = {
	async searchIncidents(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listSearchRows.call(
			this,
			{
				endpoint: 'incidents',
				paging: 'pageStart',
				fields: ['number', 'briefDescription'],
				qs: { sort: 'creationDate:desc', fields: 'id,number,briefDescription,processingStatus' },
				name: (row) =>
					[row.number, row.briefDescription, nameOf(row.processingStatus)].filter(Boolean).join(' · ') ||
					String(row.id),
			},
			filter,
			paginationToken,
		);
	},
	async searchChanges(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listSearchRows.call(
			this,
			{
				endpoint: 'operatorChanges',
				paging: 'pageStart',
				fields: ['number', 'briefDescription'],
				qs: { sort: 'creationDate:desc' },
				name: (row) =>
					[row.number, row.briefDescription, nameOf(row.status)].filter(Boolean).join(' · ') || String(row.id),
			},
			filter,
			paginationToken,
		);
	},
	async searchPersons(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listSearchRows.call(
			this,
			{
				endpoint: 'persons',
				paging: 'start',
				fields: ['surName', 'firstName', 'email'],
				qs: { query: 'archived==false' },
				name: personName,
			},
			filter,
			paginationToken,
		);
	},
	async searchOperators(this: ILoadOptionsFunctions, filter?: string, paginationToken?: string) {
		return listSearchRows.call(
			this,
			{
				endpoint: 'operators',
				paging: 'start',
				fields: ['surName', 'firstName', 'email'],
				qs: { query: 'archived==false' },
				name: personName,
			},
			filter,
			paginationToken,
		);
	},
};
