import {test, beforeEach, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import type {Server} from 'node:http';
import {once} from 'node:events';
import WebSocket from 'ws';
import {PhoneLink, PhoneOfflineError} from '../src/main/ws.ts';

let server: Server;
let link: PhoneLink;
let url: string;

beforeEach(async () => {
  server = createServer();
  link = new PhoneLink(server, 'secret');
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  url = `ws://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/ws`;
});
afterEach(async () => {
  server.close();
});

function phone(token = 'secret'): WebSocket {
  return new WebSocket(url, {headers: {Authorization: `Bearer ${token}`}});
}

test('rejects a phone with the wrong token', async () => {
  const ws = phone('nope');
  const [code] = (await once(ws, 'close')) as [number];
  assert.equal(code, 4401);
  assert.equal(link.state.connected, false);
});

test('send() rejects while no phone is connected', async () => {
  await assert.rejects(link.send('tags.getOrCreate', ['x']), PhoneOfflineError);
});

test('hello → connected state; cmd → ack round trip; close → offline', async () => {
  const ws = phone();
  await once(ws, 'open');
  ws.send(JSON.stringify({type: 'hello', app_version: '0.4.test'}));
  await new Promise<void>(resolve => link.once('state', () => resolve()));
  assert.equal(link.state.connected, true);
  assert.equal(link.state.appVersion, '0.4.test');

  ws.on('message', data => {
    const cmd = JSON.parse(String(data));
    assert.equal(cmd.type, 'cmd');
    assert.equal(cmd.fn, 'entries.create');
    ws.send(JSON.stringify({type: 'ack', id: cmd.id, ok: true, result: {id: 42}}));
  });
  const ack = await link.send('entries.create', ['2026-09-23', {entry_type: 'note'}]);
  assert.deepEqual(ack.result, {id: 42});
  assert.equal(ack.ok, true);

  ws.close();
  await new Promise<void>(resolve => link.on('state', s => !s.connected && resolve()));
  assert.equal(link.state.connected, false);
});

test('a pending command fails when the phone drops', async () => {
  const ws = phone();
  await once(ws, 'open');
  const p = link.send('tags.rename', [1, 'x']);
  ws.close();
  const ack = await p;
  assert.equal(ack.ok, false);
  assert.equal(ack.error, 'phone disconnected');
});
