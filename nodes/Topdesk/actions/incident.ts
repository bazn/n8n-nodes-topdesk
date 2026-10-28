import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { INCIDENT_DATE_FIELDS, INCIDENT_REFERENCES } from '../constants';
import {
	buildBody,
	containsCondition,
	dateCondition,
	equalsCondition,
	type FiqlCondition,
	getRequiredValue,
	incidentPath,
	limitFor,
	listQuery,
	rowsOf,
	toReference,
	toTopdeskBody,
	toTopdeskDateTime,
	topdeskApiRequest,
	topdeskApiRequestAllItems,
} from '../GenericFunctions';

/** Incident body from a create/update collection; the main incident may be given by number or ID. */
export function incidentBody(this: IExecuteFunctions, fields: IDataObject, itemIndex: number): IDataObject {
	const { mainIncident, ...rest } = fields;
	const body = buildBody.call(this, rest, itemIndex, [...INCIDENT_REFERENCES, 'callerLookup'], INCIDENT_DATE_FIELDS);
	const main = toReference(mainIncident, 'number');
	if (main) body.mainIncident = main;
	return body;
}

/** FIQL conditions for the incident filters of Get Many. */
export function incidentConditions(filters: IDataObject): FiqlCondition[] {
	const flag = (field: string) =>
		filters[field] === undefined ? [] : [{ field, operator: '==', value: String(Boolean(filters[field])) }];
	return [
		...containsCondition('briefDescription', filters.briefDescription),
		...equalsCondition('caller.id', filters.caller),
		...equalsCondition('category.id', filters.category),
		...flag('closed'),
		...flag('completed'),
		...dateCondition('creationDate', '=ge=', filters.createdAfter),
		...dateCondition('creationDate', '=lt=', filters.createdBefore),
		...dateCondition('modificationDate', '=ge=', filters.modifiedSince),
		...equalsCondition('operator.id', filters.operator),
		...equalsCondition('operatorGroup.id', filters.operatorGroup),
		...equalsCondition('processingStatus.id', filters.processingStatus),
		...equalsCondition('status', filters.status),
	];
}

function callerOf(this: IExecuteFunctions, itemIndex: number): IDataObject {
	if (this.getNodeParameter('callerType', itemIndex) === 'registered') {
		return { callerLookup: { id: getRequiredValue.call(this, 'callerLookup', itemIndex, 'caller') } };
	}
	const details = this.getNodeParameter('callerDetails', itemIndex, {}) as IDataObject;
	return {
		caller: toTopdeskBody({
			dynamicName: this.getNodeParameter('callerName', itemIndex),
			branch: toReference(this.getNodeParameter('callerBranch', itemIndex)),
			...details,
		}),
	};
}

export async function executeIncident(
	this: IExecuteFunctions,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[] | INodeExecutionData> {
	const path = () => incidentPath(getRequiredValue.call(this, 'incidentId', itemIndex, 'incident'));

	switch (operation) {
		case 'create': {
			const fields = incidentBody.call(this, this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject, itemIndex);
			return (await topdeskApiRequest.call(this, 'POST', 'incidents', {
				briefDescription: this.getNodeParameter('briefDescription', itemIndex),
				...callerOf.call(this, itemIndex),
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
				'incidents',
				listQuery(incidentConditions(filters), options),
				limitFor.call(this, itemIndex),
			);
		}

		case 'update': {
			const updates = incidentBody.call(this, this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject, itemIndex);
			if (Object.keys(updates).length === 0) {
				throw new NodeOperationError(this.getNode(), 'Add at least one field to update', { itemIndex });
			}
			return (await topdeskApiRequest.call(this, 'PATCH', path(), updates)) as IDataObject;
		}

		case 'addAction':
			// TOPdesk has no separate endpoint for actions: setting `action` on the incident appends one
			return (await topdeskApiRequest.call(this, 'PATCH', path(), {
				action: this.getNodeParameter('actionText', itemIndex),
				actionInvisibleForCaller: this.getNodeParameter('actionInvisibleForCaller', itemIndex, false),
			})) as IDataObject;

		case 'getActions':
			return topdeskApiRequestAllItems.call(this, `${path()}/actions`, {}, limitFor.call(this, itemIndex), 'start');

		case 'archive': {
			const reason = toReference(this.getNodeParameter('archivingReason', itemIndex, ''));
			return (await topdeskApiRequest.call(this, 'PATCH', `${path()}/archive`, reason ?? {})) as IDataObject;
		}

		case 'unarchive':
			return (await topdeskApiRequest.call(this, 'PATCH', `${path()}/unarchive`, {})) as IDataObject;

		case 'escalate': {
			const reason = toReference(this.getNodeParameter('escalateReason', itemIndex, ''));
			return (await topdeskApiRequest.call(this, 'PUT', `${path()}/escalate`, reason ? { escalateReason: reason } : {})) as IDataObject;
		}

		case 'deescalate': {
			const reason = toReference(this.getNodeParameter('deescalateReason', itemIndex, ''));
			return (await topdeskApiRequest.call(
				this,
				'PUT',
				`${path()}/deescalate`,
				reason ? { deescalateReason: reason } : {},
			)) as IDataObject;
		}

		case 'uploadAttachment': {
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
			const options = this.getNodeParameter('attachmentOptions', itemIndex, {}) as IDataObject;
			const binary = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
			const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
			const form = new FormData();
			form.append(
				'file',
				new Blob([new Uint8Array(buffer)], { type: binary.mimeType }),
				binary.fileName ?? `upload.${binary.fileExtension ?? 'bin'}`,
			);
			const qs: IDataObject = {};
			if (options.description) qs.description = options.description;
			if (options.invisibleForCaller !== undefined) qs.invisibleForCaller = options.invisibleForCaller;
			const response = (await topdeskApiRequest.call(this, 'POST', `${path()}/attachments`, undefined, qs, {
				body: form,
			})) as IDataObject | string;
			return typeof response === 'string' ? (JSON.parse(response) as IDataObject) : response;
		}

		case 'getAttachments':
			return rowsOf(await topdeskApiRequest.call(this, 'GET', `${path()}/attachments`));

		case 'downloadAttachment': {
			const attachmentId = String(this.getNodeParameter('attachmentId', itemIndex)).trim();
			const attachments = rowsOf(await topdeskApiRequest.call(this, 'GET', `${path()}/attachments`));
			const attachment = attachments.find((entry) => entry.id === attachmentId);
			if (!attachment) {
				throw new NodeOperationError(this.getNode(), `The incident has no attachment with ID "${attachmentId}"`, {
					itemIndex,
				});
			}
			const content = (await topdeskApiRequest.call(
				this,
				'GET',
				String(attachment.downloadUrl ?? `${path()}/attachments/${encodeURIComponent(attachmentId)}/download`),
				undefined,
				{},
				{ encoding: 'arraybuffer', json: false, headers: { Accept: '*/*' } },
			)) as ArrayBuffer;
			const binaryPropertyName = this.getNodeParameter('binaryPropertyName', itemIndex) as string;
			return {
				json: attachment,
				binary: {
					[binaryPropertyName]: await this.helpers.prepareBinaryData(
						Buffer.from(content),
						String(attachment.fileName ?? attachmentId),
					),
				},
			};
		}

		case 'addTimeSpent': {
			const fields = this.getNodeParameter('timeSpentFields', itemIndex, {}) as IDataObject;
			const body: IDataObject = {
				timeSpent: this.getNodeParameter('timeSpent', itemIndex),
				...toTopdeskBody(fields, ['operator', 'operatorGroup'], ['entryDate']),
			};
			if (!body.entryDate) body.entryDate = toTopdeskDateTime(new Date().toISOString());
			return (await topdeskApiRequest.call(this, 'POST', `${path()}/timespent`, body)) as IDataObject;
		}

		case 'getTimeSpent':
			return rowsOf(await topdeskApiRequest.call(this, 'GET', `${path()}/timespent`));
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation "${operation}"`, { itemIndex });
}
