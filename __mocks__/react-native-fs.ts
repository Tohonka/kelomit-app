// Native module — stub it so pure-logic tests that import modules using RNFS
// (e.g. the transcription provider) can load without the real binary.
export default {
  DocumentDirectoryPath: '/mock/docs',
  CachesDirectoryPath: '/mock/caches',
  exists: jest.fn(() => Promise.resolve(true)),
  mkdir: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
  downloadFile: jest.fn(() => ({promise: Promise.resolve({statusCode: 200})})),
  moveFile: jest.fn(() => Promise.resolve()),
  readDir: jest.fn(() => Promise.resolve([])),
  stat: jest.fn(() => Promise.resolve({size: 1024})),
  uploadFiles: jest.fn(() => ({
    promise: Promise.resolve({statusCode: 200, body: ''}),
  })),
};
