/**
 * سراج's understanding, as the app uses it: the open-source model (see neural.ts) loaded in the background after the app opens, and the vectors of the symbols dictionary.
 * `find(question)` answers with the dictionary words whose MEANING is closest to the question. If the model cannot start for any reason (an old phone, no memory, a blocked file) it
 * simply stays absent and سراج answers with his lexical search exactly as before: nothing here can break the app.
 */
import { Neural, Unigram, VectorIndex, clean, type Ort, type Piece } from './neural';

export interface Meaning { head: string; rows: number[]; score: number; }
/** how much closer the question is to the example questions about dreams / the books than to the others (positive = it is about them) */
export const ABOUT_MIN = 0.005;
export interface Understanding { ready: boolean; find(question: string, k?: number): Promise<Meaning[]>; }

/** reads a file of the app's `ai/` folder (the app fetches it; a test may read the disk) */
export type Reader = (rel: string) => Promise<ArrayBuffer>;
const fetcher = (base: string): Reader => async (rel) => { const r = await fetch(base + rel); if (!r.ok) throw new Error(rel + ' ' + r.status); return r.arrayBuffer(); };
const json = async <T,>(read: Reader, rel: string) => JSON.parse(new TextDecoder().decode(await read(rel))) as T;

export class Understood implements Understanding {
  ready = true;
  private constructor(private net: Neural, private heads: VectorIndex, private names: [string, number[]][], private anchors: VectorIndex, private labels: number[]) {}
  /** the margin by which a question is nearer to the dream / book examples than to the rest (the mean of its three nearest of each kind) */
  async about(question: string): Promise<number> { const [v] = await this.net.embed(['query: ' + clean(question)]); return this.margin(v); }
  private margin(v: Float32Array): number {
    const all = this.anchors.top(v, this.anchors.size); const m = (l: number) => { const t = all.filter(([i]) => this.labels[i] === l).slice(0, 3); return t.reduce((a, b) => a + b[1], 0) / Math.max(1, t.length); };
    return m(1) - m(0);
  }
  /** loads everything from the app's own `ai/` folder; resolves to null (never throws) when the model cannot start */
  static async start(base: string, ort?: Ort, read: Reader = fetcher(base)): Promise<Understood | null> {
    try {
      const o: Ort = ort ?? (await import('onnxruntime-web/wasm' as string)) as unknown as Ort;
      o.env.wasm.numThreads = 1; if (!ort) o.env.wasm.wasmPaths = new URL(base + 'ai/', document.baseURI).href;   // absolute: the runtime would otherwise look next to its own script
      const [vocab, model, bin, names, abin, labels] = await Promise.all([json<Piece[]>(read, 'ai/vocab.json'), read('ai/e5-ar.onnx'), read('ai/heads.bin'), json<[string, number[]][]>(read, 'ai/heads.json'), read('ai/anchors.bin'), json<number[]>(read, 'ai/anchors.json')]);
      const net = await Neural.load(o, new Unigram(vocab), model);
      await net.embed(['query: مرحبا']);                                  // warms the runtime up so the first real question is quick
      return new Understood(net, new VectorIndex(new Int8Array(bin)), names, new VectorIndex(new Int8Array(abin)), labels);
    } catch (e) { console.warn('[سراج] the understanding model did not start:', e); return null; }
  }
  async find(question: string, k = 5): Promise<Meaning[]> {
    const q = clean(question); if (!q) return [];
    const [v] = await this.net.embed(['query: ' + q]);
    if (this.margin(v) < ABOUT_MIN) return [];                          // not a question about dreams or the books: nothing is claimed
    return this.heads.top(v, k).map(([i, s]) => ({ head: this.names[i][0], rows: this.names[i][1], score: s }));
  }
}
