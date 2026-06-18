import { readFileText } from '../src/packs/packStorage';

describe('readFileText', () => {
  it('reads via fetch(file://<path>) and returns the body text', async () => {
    const fetchMock = jest.fn(async () => ({ text: async () => '{"hints":[]}' }));
    (globalThis as unknown as { fetch: typeof fetchMock }).fetch = fetchMock;

    const out = await readFileText('/packs/x.json', 'x');

    expect(out).toBe('{"hints":[]}');
    // absolute path → file:// + /path = triple-slash file URL
    expect(fetchMock).toHaveBeenCalledWith('file:///packs/x.json');
  });
});
