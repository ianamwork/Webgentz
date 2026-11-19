// Tests for sortedAgents() in web/jungle/agents.js.
// state.js reads localStorage at import time, so stub it before importing.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  },
});

const { sortedAgents } = await import('../../web/jungle/agents.js');
const { S } = await import('../../web/jungle/state.js');

function load(list) {
  S.agents.clear();
  for (const a of list) S.agents.set(a.id, a);
}
const ids = () => sortedAgents().map(a => a.id);

describe('sortedAgents', () => {
  beforeEach(() => S.agents.clear());

  test('empty state returns empty list', () => {
    assert.deepEqual(sortedAgents(), []);
  });

  test('orders by STATUS_ORDER: needs_you, stuck, working, idle, done', () => {
    load([
      { id: 'd', status: 'done' },
      { id: 'i', status: 'idle' },
      { id: 'w', status: 'working' },
      { id: 's', status: 'stuck' },
      { id: 'n', status: 'needs_you' },
    ]);
    assert.deepEqual(ids(), ['n', 's', 'w', 'i', 'd']);
  });

  test('gone and sleeping agents are excluded', () => {
    load([
      { id: 'g', status: 'gone' },
      { id: 'z', status: 'sleeping' },
      { id: 'w', status: 'working' },
    ]);
    assert.deepEqual(ids(), ['w']);
  });

  test('unknown or missing status sorts last, after done', () => {
    load([
      { id: 'u', status: 'mystery' },
      { id: 'm' },
      { id: 'd', status: 'done' },
      { id: 'n', status: 'needs_you' },
    ]);
    assert.deepEqual(ids(), ['n', 'd', 'u', 'm']);
  });

  test('ties keep insertion order (stable sort)', () => {
    load([
      { id: 'w1', status: 'working' },
      { id: 'n1', status: 'needs_you' },
      { id: 'w2', status: 'working' },
      { id: 'n2', status: 'needs_you' },
      { id: 'w3', status: 'working' },
    ]);
    assert.deepEqual(ids(), ['n1', 'n2', 'w1', 'w2', 'w3']);
  });

  test('does not reorder S.agents and returns a fresh array', () => {
    load([
      { id: 'w', status: 'working' },
      { id: 'n', status: 'needs_you' },
    ]);
    const first = sortedAgents();
    assert.deepEqual([...S.agents.keys()], ['w', 'n']);
    assert.notEqual(first, sortedAgents());
  });

  test('returns the stored agent objects, not copies', () => {
    const a = { id: 'x', status: 'idle', name: 'x-1234' };
    load([a]);
    assert.equal(sortedAgents()[0], a);
  });
});
