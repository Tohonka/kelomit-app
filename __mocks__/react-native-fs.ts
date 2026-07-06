// Native module — stub it so pure-logic tests that import modules using RNFS
// (e.g. the transcription provider) can load without the real binary.
export default {
  DocumentDirectoryPath: '/mock/docs',
  exists: jest.fn(() => Promise.resolve(true)),
  mkdir: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
};
