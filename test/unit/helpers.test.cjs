// Unit tests for pure helpers. Run with `npm test` (builds first, then uses node:test against dist/).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const dist = path.join(__dirname, '..', '..', 'dist', 'nodes');
const g = require(path.join(dist, 'Topdesk', 'GenericFunctions.js'));
const { incidentConditions } = require(path.join(dist, 'Topdesk', 'actions', 'incident.js'));
const { changePatch } = require(path.join(dist, 'Topdesk', 'actions', 'change.js'));
const { nameConditions } = require(path.join(dist, 'Topdesk', 'actions', 'directory.js'));
const trigger = require(path.join(dist, 'TopdeskTrigger', 'TopdeskTrigger.node.js'));
const { Topdesk } = require(path.join(dist, 'Topdesk', 'Topdesk.node.js'));

const UUID = '3f8c1c5e-1a2b-4c3d-9e8f-0123456789ab';

test('normalizeUrl strips /tas/api and adds the protocol', () => {
	assert.equal(g.normalizeUrl('https://acme.topdesk.net/tas/api/'), 'https://acme.topdesk.net');
	assert.equal(g.normalizeUrl('acme.topdesk.net'), 'https://acme.topdesk.net');
	assert.equal(g.normalizeUrl(' https://desk.acme.ch/tas '), 'https://desk.acme.ch');
});

test('incidentPath uses the UUID or the number', () => {
	assert.equal(g.incidentPath(UUID), `incidents/id/${UUID}`);
	assert.equal(g.incidentPath('I 2610 123'), 'incidents/number/I%202610%20123');
});

test('fiqlValue quotes values with spaces or reserved characters', () => {
	assert.equal(g.fiqlValue('firstLine'), 'firstLine');
	assert.equal(g.fiqlValue('*printer*'), '*printer*');
	assert.equal(g.fiqlValue('2026-03-01T10:15:30Z'), '2026-03-01T10:15:30Z');
	assert.equal(g.fiqlValue('*no "network"*'), '"*no \\"network\\"*"');
	assert.equal(g.fiqlValue('a;b'), '"a;b"');
});

test('buildQuery joins conditions with AND and appends the raw query', () => {
	assert.equal(
		g.buildQuery(
			[
				{ field: 'closed', operator: '==', value: 'false' },
				{ field: 'status', operator: '=in=', value: 'firstLine, secondLine' },
			],
			'number==I*,briefDescription==*vpn*',
		),
		'closed==false;status=in=(firstLine,secondLine);(number==I*,briefDescription==*vpn*)',
	);
	assert.equal(g.buildQuery([], ''), undefined);
	assert.equal(g.buildQuery([], 'closed==true'), 'closed==true');
});

test('conditions skip empty filters and resolve resource locators', () => {
	assert.deepEqual(g.equalsCondition('caller.id', { __rl: true, mode: 'list', value: '' }), []);
	assert.deepEqual(g.equalsCondition('caller.id', { __rl: true, mode: 'id', value: UUID }), [
		{ field: 'caller.id', operator: '==', value: UUID },
	]);
	assert.deepEqual(g.containsCondition('briefDescription', ''), []);
	assert.deepEqual(g.containsCondition('briefDescription', 'vpn'), [
		{ field: 'briefDescription', operator: '==', value: '*vpn*' },
	]);
});

test('incidentConditions maps every filter', () => {
	assert.equal(
		g.buildQuery(
			incidentConditions({
				briefDescription: 'mail',
				operatorGroup: UUID,
				closed: false,
				createdAfter: '2026-03-01T10:15:30.500+01:00',
			}),
		),
		`briefDescription==*mail*;closed==false;creationDate=ge=2026-03-01T09:15:30Z;operatorGroup.id==${UUID}`,
	);
});

test('nameConditions lists active records unless archived is set', () => {
	assert.equal(g.buildQuery(nameConditions({})), 'archived==false');
	assert.equal(g.buildQuery(nameConditions({ archived: true, surName: 'Meier' })), 'archived==true;surName==*Meier*');
});

test('dates are converted to the TOPdesk formats', () => {
	assert.equal(g.timestampMs('2026-03-01T10:15:30.000+0000'), Date.UTC(2026, 2, 1, 10, 15, 30));
	assert.equal(g.toTopdeskDateTime('2026-03-01T11:15:30+01:00'), '2026-03-01T10:15:30.000+0000');
	assert.equal(g.toFiqlDateTime(Date.UTC(2026, 2, 1, 10, 15, 30, 900)), '2026-03-01T10:15:30Z');
	assert.equal(g.toTopdeskDateTime(''), undefined);
});

test('toTopdeskBody turns references into objects and drops empty values', () => {
	assert.deepEqual(
		g.toTopdeskBody(
			{
				briefDescription: 'Printer broken',
				category: UUID,
				subcategory: 'Hardware',
				operator: { __rl: true, mode: 'list', value: UUID },
				impact: '',
				closed: false,
				targetDate: '2026-03-01T11:00:00+01:00',
			},
			['category', 'subcategory', 'operator', 'impact'],
			['targetDate'],
		),
		{
			briefDescription: 'Printer broken',
			category: { id: UUID },
			subcategory: { name: 'Hardware' },
			operator: { id: UUID },
			closed: false,
			targetDate: '2026-03-01T10:00:00.000+0000',
		},
	);
	assert.deepEqual(g.toReference('I 2610 001', 'number'), { number: 'I 2610 001' });
});

test('rowsOf reads arrays, result pages and empty 204 bodies', () => {
	assert.deepEqual(g.rowsOf([{ id: 1 }]), [{ id: 1 }]);
	assert.deepEqual(g.rowsOf({ results: [{ id: 2 }], next: 'x' }), [{ id: 2 }]);
	assert.deepEqual(g.rowsOf(''), []);
	assert.deepEqual(g.rowsOf(undefined), []);
});

test('extractTopdeskMessage reads the different error bodies', () => {
	assert.equal(g.extractTopdeskMessage({ response: { body: [{ message: 'Caller is required' }] } }), 'Caller is required');
	assert.equal(
		g.extractTopdeskMessage({ cause: { response: { data: { errors: [{ errorCode: 'E1', message: 'Invalid value', field: 'impact' }] } } } }),
		'impact: Invalid value (E1)',
	);
	assert.equal(g.extractTopdeskMessage({ response: { body: '{"message":"Not found"}' } }), 'Not found');
	assert.equal(g.extractTopdeskMessage({ response: { body: 'plain' } }), undefined);
});

test('rateLimitWaitMs follows Retry-After and caps the wait', () => {
	assert.equal(g.rateLimitWaitMs({ response: { headers: { 'retry-after': '3' } } }, 0), 3000);
	assert.equal(g.rateLimitWaitMs({}, 2), 4000);
	assert.equal(g.rateLimitWaitMs({ response: { headers: { 'retry-after': '600' } } }, 0), 60000);
});

test('changePatch builds replace operations and appends raw ones', () => {
	assert.deepEqual(changePatch({ briefDescription: 'New', externalNumber: '' }, [{ op: 'add', path: '/x', value: 1 }]), [
		{ op: 'replace', path: '/briefDescription', value: 'New' },
		{ op: 'add', path: '/x', value: 1 },
	]);
});

test('trigger position skips incidents already emitted in the boundary second', () => {
	const field = 'modificationDate';
	const rows = [
		{ id: 'a', modificationDate: '2026-03-01T10:00:00.100+0000' },
		{ id: 'b', modificationDate: '2026-03-01T10:00:05.200+0000' },
		{ id: 'c', modificationDate: '2026-03-01T10:00:05.900+0000' },
	];
	const position = trigger.nextPosition(rows, field, { lastMs: 0, lastKeys: [] });
	assert.equal(position.lastMs, Date.UTC(2026, 2, 1, 10, 0, 5, 900));
	assert.deepEqual(position.lastKeys, [trigger.incidentKey(rows[1], field), trigger.incidentKey(rows[2], field)]);

	// a later poll in the same second keeps the earlier keys
	const next = trigger.nextPosition([rows[2]], field, position);
	assert.deepEqual(next.lastKeys, position.lastKeys);

	// a new change of the same incident has a new key
	assert.notEqual(
		trigger.incidentKey({ id: 'c', modificationDate: '2026-03-01T10:07:00.000+0000' }, field),
		trigger.incidentKey(rows[2], field),
	);
});

test('trigger filters become FIQL conditions', () => {
	assert.equal(
		g.buildQuery(trigger.filterConditions({ operatorGroup: UUID, excludeClosed: true, status: 'secondLine' })),
		`operatorGroup.id==${UUID};status==secondLine;closed==false`,
	);
});

test('every operation has an action label and options are sorted', () => {
	const { properties } = new Topdesk().description;
	for (const property of properties.filter((entry) => entry.name === 'operation')) {
		const names = property.options.map((option) => option.name);
		assert.deepEqual(names, [...names].sort((left, right) => left.localeCompare(right)), names.join(', '));
		for (const option of property.options) assert.ok(option.action, `${option.name} has no action`);
	}
});
