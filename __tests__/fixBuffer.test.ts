import {parseFixLine} from '../src/native/backgroundLocation';

describe('parseFixLine', () => {
  it('parses a full native buffer line', () => {
    const line =
      '{"latitude":60.45,"longitude":22.26,"accuracy":8.5,"altitude":12.0,"speed":1.9,"timestamp":1783925597000}';
    expect(parseFixLine(line)).toEqual({
      latitude: 60.45,
      longitude: 22.26,
      accuracy: 8.5,
      altitude: 12.0,
      speed: 1.9,
      timestamp: 1783925597000,
    });
  });

  it('maps native nulls (no speed/altitude) to null', () => {
    const line =
      '{"latitude":60.45,"longitude":22.26,"accuracy":20.1,"altitude":null,"speed":null,"timestamp":1783925597000}';
    const fix = parseFixLine(line);
    expect(fix?.speed).toBeNull();
    expect(fix?.altitude).toBeNull();
  });

  it('rejects malformed or incomplete lines', () => {
    expect(parseFixLine('')).toBeNull();
    expect(parseFixLine('not json')).toBeNull();
    expect(parseFixLine('{"latitude":60.45}')).toBeNull();
    expect(parseFixLine('{"latitude":"x","longitude":22.2,"timestamp":1}')).toBeNull();
  });
});
