import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';

/** Base URL expression for credential tests; mirrors getBaseUrl() in GenericFunctions. */
export const BASE_URL_EXPRESSION =
	'={{ (/^https?:\\/\\//i.test($credentials.url.trim()) ? $credentials.url.trim() : "https://" + $credentials.url.trim()).replace(/\\/+$/, "").replace(/\\/tas(\\/api)?$/i, "") + "/tas/api" }}';

export class TopdeskApi implements ICredentialType {
	name = 'topdeskApi';

	displayName = 'TOPdesk API';

	icon = {
		light: 'file:../nodes/Topdesk/topdesk.svg',
		dark: 'file:../nodes/Topdesk/topdesk.dark.svg',
	} as const;

	documentationUrl = 'https://developers.topdesk.com/tutorial.html#show-collapse-usage-createAppPassword';

	properties: INodeProperties[] = [
		{
			displayName: 'TOPdesk URL',
			name: 'url',
			type: 'string',
			default: '',
			required: true,
			placeholder: 'https://yourcompany.topdesk.net',
			description: 'Address of your TOPdesk environment, without /tas/api',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
			description: 'Login name of the operator (or person) the node acts as',
		},
		{
			displayName: 'Application Password',
			name: 'applicationPassword',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Application password created in TOPdesk under My Settings → Application passwords. The normal login password does not work.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			auth: {
				username: '={{$credentials.username}}',
				password: '={{$credentials.applicationPassword}}',
			},
			headers: {
				Accept: 'application/json',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: BASE_URL_EXPRESSION,
			url: '/operators/current',
		},
	};
}
