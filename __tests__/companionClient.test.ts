jest.mock('../src/services/companion/commands', () => ({
  runCommand: jest.fn(async (cmd: {id: string}) => ({type: 'ack', id: cmd.id, ok: true, result: null})),
}));
jest.mock('../src/services/companion/settings', () => ({getCompanionConfig: jest.fn()}));
jest.mock('../src/services/companion/push', () => ({pushToCompanion: jest.fn(async () => 'done')}));
jest.mock('../src/services/companion/autoPush', () => ({kickCompanionPush: jest.fn()}));
jest.mock('../src/services/diag', () => ({diag: jest.fn()}));
jest.mock('../src/version', () => ({APP_VERSION: 'test'}));

import {handleMessage, wsUrl} from '../src/services/companion/client';
import {runCommand} from '../src/services/companion/commands';

describe('wsUrl', () => {
  it('turns the paired http url into the /ws endpoint', () => {
    expect(wsUrl('http://192.168.1.20:8090')).toBe('ws://192.168.1.20:8090/ws');
  });
});

describe('handleMessage', () => {
  it('routes a cmd frame and replies with its ack', async () => {
    const reply = jest.fn();
    await handleMessage(JSON.stringify({type: 'cmd', id: 'k1', fn: 'tags.getOrCreate', args: ['x']}), reply);
    expect(runCommand).toHaveBeenCalledWith({id: 'k1', fn: 'tags.getOrCreate', args: ['x']});
    expect(reply).toHaveBeenCalledWith({type: 'ack', id: 'k1', ok: true, result: null});
  });

  it('ignores garbage and non-command frames', async () => {
    const reply = jest.fn();
    await handleMessage('not json', reply);
    await handleMessage(JSON.stringify({type: 'hello'}), reply);
    await handleMessage(JSON.stringify({type: 'cmd', id: 1, fn: 'x'}), reply);
    expect(reply).not.toHaveBeenCalled();
  });
});
