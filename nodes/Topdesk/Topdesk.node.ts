import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { executeChange } from './actions/change';
import { executeBranch, executeOperator, executeOperatorGroup, executePerson } from './actions/directory';
import { executeIncident } from './actions/incident';
import { executeApiRequest } from './actions/other';
import { changeDescription } from './descriptions/ChangeDescription';
import {
	branchDescription,
	operatorDescription,
	operatorGroupDescription,
	personDescription,
} from './descriptions/DirectoryDescriptions';
import { incidentDescription } from './descriptions/IncidentDescription';
import { apiRequestDescription } from './descriptions/OtherDescriptions';
import { topdeskCredentials } from './descriptions/shared';
import { listSearch, loadOptions } from './methods';

export class Topdesk implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'TOPdesk',
		name: 'topdesk',
		icon: { light: 'file:topdesk.svg', dark: 'file:topdesk.dark.svg' },
		group: ['transform'],
		version: [1],
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Work with incidents, changes, persons, operators, operator groups and branches in TOPdesk',
		defaults: {
			name: 'TOPdesk',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: topdeskCredentials,
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'API Request',
						value: 'apiRequest',
						description: 'Call any TOPdesk endpoint with this credential',
					},
					{ name: 'Branch', value: 'branch', description: 'Locations of the organization' },
					{ name: 'Change', value: 'change' },
					{ name: 'Incident', value: 'incident', description: 'Calls, tickets and requests' },
					{ name: 'Operator', value: 'operator', description: 'Service desk staff' },
					{ name: 'Operator Group', value: 'operatorGroup' },
					{ name: 'Person', value: 'person', description: 'Callers and requesters' },
				],
				default: 'incident',
			},
			...incidentDescription,
			...changeDescription,
			...personDescription,
			...operatorDescription,
			...operatorGroupDescription,
			...branchDescription,
			...apiRequestDescription,
		],
	};

	methods = { listSearch, loadOptions };

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;

				let result: IDataObject | IDataObject[] | INodeExecutionData;
				if (resource === 'incident') {
					result = await executeIncident.call(this, operation, itemIndex);
				} else if (resource === 'change') {
					result = await executeChange.call(this, operation, itemIndex);
				} else if (resource === 'person') {
					result = await executePerson.call(this, operation, itemIndex);
				} else if (resource === 'operator') {
					result = await executeOperator.call(this, operation, itemIndex);
				} else if (resource === 'operatorGroup') {
					result = await executeOperatorGroup.call(this, operation, itemIndex);
				} else if (resource === 'branch') {
					result = await executeBranch.call(this, operation, itemIndex);
				} else if (resource === 'apiRequest') {
					result = await executeApiRequest.call(this, itemIndex);
				} else {
					throw new NodeOperationError(this.getNode(), `Unsupported resource "${resource}"`, { itemIndex });
				}

				// downloaded attachments come back as complete items with binary data
				if (!Array.isArray(result) && 'binary' in result && 'json' in result) {
					returnData.push({ ...(result as INodeExecutionData), pairedItem: { item: itemIndex } });
					continue;
				}

				returnData.push(
					...this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(result as IDataObject | IDataObject[]), {
						itemData: { item: itemIndex },
					}),
				);
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: itemIndex } });
					continue;
				}
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error.errorResponse ?? (error as unknown as JsonObject), {
						message: error.message,
						description: error.description ?? undefined,
						httpCode: error.httpCode ?? undefined,
						itemIndex,
					});
				}
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error.message, {
						description: error.description ?? undefined,
						itemIndex,
					});
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
			}
		}

		return [returnData];
	}
}
