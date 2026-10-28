import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import {
	buildBody,
	containsCondition,
	dateCondition,
	getRequiredValue,
	getUuid,
	limitFor,
	listQuery,
	toReference,
	topdeskApiRequest,
	topdeskApiRequestAllItems,
} from '../GenericFunctions';

const CHANGE_REFERENCES = ['benefit', 'category', 'impact', 'priority', 'subcategory'];

/** JSON Patch operations for a change update: the simple fields as `replace`, then the raw operations. */
export function changePatch(fields: IDataObject, extra: IDataObject[] = []): IDataObject[] {
	const operations: IDataObject[] = [];
	for (const key of ['briefDescription', 'externalNumber']) {
		if (fields[key] !== undefined && fields[key] !== '') {
			operations.push({ op: 'replace', path: `/${key}`, value: fields[key] });
		}
	}
	return [...operations, ...extra];
}

function parsePatch(this: IExecuteFunctions, value: unknown, itemIndex: number): IDataObject[] {
	if (value === undefined || value === null || value === '') return [];
	if (Array.isArray(value)) return value as IDataObject[];
	try {
		const parsed = JSON.parse(String(value)) as unknown;
		if (Array.isArray(parsed)) return parsed as IDataObject[];
	} catch {
		// handled below
	}
	throw new NodeOperationError(this.getNode(), '"Patch Operations (JSON)" must be a JSON array', { itemIndex });
}

export async function executeChange(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	// GET /operatorChanges/{idOrNumber} accepts the UUID as well as the change number
	const path = () =>
		`operatorChanges/${encodeURIComponent(getRequiredValue.call(this, 'changeId', itemIndex, 'change'))}`;

	switch (operation) {
		case 'create': {
			const { template, ...fields } = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
			const body: IDataObject = {
				requester: { id: getUuid.call(this, 'requester', itemIndex, 'requester') },
				briefDescription: this.getNodeParameter('briefDescription', itemIndex),
				...buildBody.call(this, fields, itemIndex, CHANGE_REFERENCES),
			};
			const templateReference = toReference(template, 'number');
			if (templateReference) {
				body.template = templateReference;
			} else {
				body.changeType = this.getNodeParameter('changeType', itemIndex);
			}
			return (await topdeskApiRequest.call(this, 'POST', 'operatorChanges', body)) as IDataObject;
		}

		case 'get':
			return (await topdeskApiRequest.call(this, 'GET', path())) as IDataObject;

		case 'getAll': {
			const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			const conditions = [
				...containsCondition('briefDescription', filters.briefDescription),
				...dateCondition('creationDate', '=ge=', filters.createdAfter),
				...dateCondition('creationDate', '=lt=', filters.createdBefore),
				...dateCondition('modificationDate', '=ge=', filters.modifiedSince),
			];
			return topdeskApiRequestAllItems.call(
				this,
				'operatorChanges',
				listQuery(conditions, options),
				limitFor.call(this, itemIndex),
			);
		}

		case 'update': {
			const fields = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
			const operations = changePatch(fields, parsePatch.call(this, fields.patch, itemIndex));
			if (operations.length === 0) {
				throw new NodeOperationError(this.getNode(), 'Add at least one field to update', { itemIndex });
			}
			return (await topdeskApiRequest.call(this, 'PATCH', path(), operations, {}, {
				headers: { Accept: 'application/json', 'Content-Type': 'application/json-patch+json' },
			})) as IDataObject;
		}

		case 'getProgressTrail':
			return topdeskApiRequestAllItems.call(this, `${path()}/progresstrail`, {}, limitFor.call(this, itemIndex));
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex });
}
