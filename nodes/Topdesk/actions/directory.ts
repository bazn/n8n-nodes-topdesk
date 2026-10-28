import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { PERSON_REFERENCES } from '../constants';
import {
	buildBody,
	containsCondition,
	equalsCondition,
	type FiqlCondition,
	getUuid,
	limitFor,
	listQuery,
	rowsOf,
	toReference,
	topdeskApiRequest,
	topdeskApiRequestAllItems,
} from '../GenericFunctions';

/** Name and archive filters of persons and operators. Without the archive filter only active records are listed. */
export function nameConditions(filters: IDataObject): FiqlCondition[] {
	return [
		{ field: 'archived', operator: '==', value: String(Boolean(filters.archived)) },
		...containsCondition('email', filters.email),
		...containsCondition('firstName', filters.firstName),
		...containsCondition('surName', filters.surName),
	];
}

function updatesOf(this: IExecuteFunctions, itemIndex: number, references: string[] = []): IDataObject {
	const updates = buildBody.call(this, this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject, itemIndex, references);
	if (Object.keys(updates).length === 0) {
		throw new NodeOperationError(this.getNode(), 'Add at least one field to update', { itemIndex });
	}
	return updates;
}

// ---------------------------------------------------------------- Person

export async function executePerson(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const path = () => `persons/id/${getUuid.call(this, 'personId', itemIndex, 'person')}`;

	switch (operation) {
		case 'create': {
			const fields = buildBody.call(
				this,
				this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject,
				itemIndex,
				PERSON_REFERENCES,
			);
			return (await topdeskApiRequest.call(this, 'POST', 'persons', {
				surName: this.getNodeParameter('surName', itemIndex),
				branch: toReference(this.getNodeParameter('branch', itemIndex)),
				...fields,
			})) as IDataObject;
		}

		case 'get':
			return (await topdeskApiRequest.call(this, 'GET', path())) as IDataObject;

		case 'getAll': {
			const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			return topdeskApiRequestAllItems.call(
				this,
				'persons',
				listQuery([...nameConditions(filters), ...equalsCondition('branch.id', filters.branch)], options),
				limitFor.call(this, itemIndex),
				'start',
			);
		}

		case 'update':
			return (await topdeskApiRequest.call(this, 'PATCH', path(), updatesOf.call(this, itemIndex, PERSON_REFERENCES))) as IDataObject;

		case 'archive': {
			const reason = toReference(this.getNodeParameter('archivingReason', itemIndex, ''));
			return (await topdeskApiRequest.call(this, 'PATCH', `${path()}/archive`, reason ?? {})) as IDataObject;
		}

		case 'unarchive':
			return (await topdeskApiRequest.call(this, 'PATCH', `${path()}/unarchive`, {})) as IDataObject;
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex });
}

// ---------------------------------------------------------------- Operator

export async function executeOperator(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	switch (operation) {
		case 'get':
			return (await topdeskApiRequest.call(
				this,
				'GET',
				`operators/id/${getUuid.call(this, 'operatorId', itemIndex, 'operator')}`,
			)) as IDataObject;

		case 'getCurrent':
			return (await topdeskApiRequest.call(this, 'GET', 'operators/current')) as IDataObject;

		case 'getAll': {
			const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			return topdeskApiRequestAllItems.call(
				this,
				'operators',
				listQuery(nameConditions(filters), options),
				limitFor.call(this, itemIndex),
				'start',
			);
		}
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex });
}

// ---------------------------------------------------------------- Operator group

export async function executeOperatorGroup(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const path = () => `operatorgroups/id/${getUuid.call(this, 'operatorGroupId', itemIndex, 'operator group')}`;

	switch (operation) {
		case 'get':
			return (await topdeskApiRequest.call(this, 'GET', path())) as IDataObject;

		case 'getOperators':
			return rowsOf(await topdeskApiRequest.call(this, 'GET', `${path()}/operators`));

		case 'getAll': {
			const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			const conditions: FiqlCondition[] = [
				{ field: 'archived', operator: '==', value: String(Boolean(filters.archived)) },
				...containsCondition('groupName', filters.groupName),
			];
			return topdeskApiRequestAllItems.call(
				this,
				'operatorgroups',
				listQuery(conditions, options),
				limitFor.call(this, itemIndex),
				'start',
			);
		}
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex });
}

// ---------------------------------------------------------------- Branch

export async function executeBranch(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	const path = () => `branches/id/${getUuid.call(this, 'branchId', itemIndex, 'branch')}`;

	switch (operation) {
		case 'create': {
			const fields = buildBody.call(this, this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject, itemIndex);
			return (await topdeskApiRequest.call(this, 'POST', 'branches', {
				name: this.getNodeParameter('name', itemIndex),
				...fields,
			})) as IDataObject;
		}

		case 'get':
			return (await topdeskApiRequest.call(this, 'GET', path())) as IDataObject;

		case 'getAll': {
			// the branch list has no paging; it returns every match at once
			const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			const rows = rowsOf(
				await topdeskApiRequest.call(
					this,
					'GET',
					'branches',
					undefined,
					listQuery(containsCondition('name', filters.name), options),
				),
			);
			const limit = limitFor.call(this, itemIndex);
			return limit === undefined ? rows : rows.slice(0, limit);
		}

		case 'update':
			return (await topdeskApiRequest.call(this, 'PATCH', path(), updatesOf.call(this, itemIndex))) as IDataObject;
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex });
}
