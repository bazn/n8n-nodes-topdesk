import type { IDataObject, IExecuteFunctions, IHttpRequestMethods } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { parseJsonParameter, topdeskApiRequest } from '../GenericFunctions';

export async function executeApiRequest(this: IExecuteFunctions, itemIndex: number): Promise<IDataObject | IDataObject[]> {
	const method = this.getNodeParameter('method', itemIndex) as IHttpRequestMethods;
	const endpoint = (this.getNodeParameter('endpoint', itemIndex) as string).trim();
	if (/^https?:\/\//i.test(endpoint)) {
		// only paths are accepted, so the credential is never sent to another host
		throw new NodeOperationError(this.getNode(), 'The endpoint must be a path below /tas/api, not a full URL', {
			itemIndex,
		});
	}
	const qs = parseJsonParameter.call(this, this.getNodeParameter('query', itemIndex, '{}'), 'Query Parameters', itemIndex);

	let body: IDataObject | IDataObject[] | undefined;
	const headers: IDataObject = { Accept: 'application/json' };
	if (['PATCH', 'POST', 'PUT'].includes(method)) {
		const raw = this.getNodeParameter('body', itemIndex, '') as unknown;
		if (typeof raw === 'object' && raw !== null) {
			body = raw as IDataObject | IDataObject[];
		} else if (typeof raw === 'string' && raw.trim() !== '') {
			try {
				body = JSON.parse(raw) as IDataObject | IDataObject[];
			} catch {
				throw new NodeOperationError(this.getNode(), '"Body" must be valid JSON', { itemIndex });
			}
		}
		headers['Content-Type'] = this.getNodeParameter('contentType', itemIndex, 'application/json');
	}

	const response = (await topdeskApiRequest.call(this, method, endpoint.replace(/^\/?(tas\/api\/)?/, ''), body, qs, {
		headers: headers as Record<string, string>,
	})) as unknown;
	if (Array.isArray(response)) {
		// n8n turns a returned array into items, so an unsplit array has to be wrapped
		return this.getNodeParameter('splitArray', itemIndex, true) ? (response as IDataObject[]) : { data: response as IDataObject[] };
	}
	if (response && typeof response === 'object') return response as IDataObject;
	return { response: response ?? null } as IDataObject;
}
