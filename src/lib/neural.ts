/**
 * The «understanding» of سراج: an open-source neural model (multilingual-e5-small, MIT) that turns a sentence into a vector of its MEANING, so that «لدغتني عقرب» finds the
 * symbol «العقرب» and «حيوان مفترس يهاجمني» finds «الأسد» although the words differ. It runs on the phone itself (ONNX Runtime Web, WASM): no server, no key, nothing leaves the device.
 * The model's vocabulary was cut to Arabic (scripts/build_semantic.py: 250k pieces → 27k, same network), the tokenizer below is a SentencePiece-Unigram one written for that vocabulary,
 * and the vectors of the dictionary were computed with THIS code (scripts/build_vectors.mjs), so a query and the entries are always embedded the same way.
 */
export type Piece = [string, number];

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ​-‏‪-‮⁦-⁩﻿]/g;
/** the text the model sees: NFKC, without vocalisation / tatweel / invisible marks, single spaces */
export const clean = (s: string): string => s.normalize('NFKC').replace(MARKS, '').replace(/\s+/g, ' ').trim();

/** SentencePiece-Unigram (the tokenizer of XLM-R models) over a given vocabulary: the best segmentation of every word, each word written with the «▁» mark in front. */
export class Unigram {
  private map = new Map<string, number>(); private score: number[]; private maxLen = 1; private unkScore: number;
  constructor(vocab: Piece[]) {
    this.score = vocab.map((v) => v[1]); let min = 0;
    vocab.forEach(([p, s], i) => { if (i < 4) return; this.map.set(p, i); const n = [...p].length; if (n > this.maxLen) this.maxLen = n; if (s < min) min = s; });
    this.unkScore = min - 10;
  }
  private word(w: string, out: number[]) {
    const ch = [...('▁' + w)]; const n = ch.length;
    const best = new Float64Array(n + 1).fill(-Infinity); const from = new Int32Array(n + 1).fill(-1); const id = new Int32Array(n + 1).fill(3); best[0] = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = Math.max(0, i - this.maxLen); j < i; j++) {
        if (best[j] === -Infinity) continue; const k = this.map.get(ch.slice(j, i).join(''));
        if (k !== undefined) { const s = best[j] + this.score[k]; if (s > best[i]) { best[i] = s; from[i] = j; id[i] = k; } }
      }
      if (best[i] === -Infinity || (from[i] === -1)) { const s = best[i - 1] + this.unkScore; if (s > best[i]) { best[i] = s; from[i] = i - 1; id[i] = 3; } }
    }
    const seq: number[] = []; for (let i = n; i > 0; i = from[i]) seq.push(id[i]);
    seq.reverse(); for (const t of seq) out.push(t);
  }
  /** <s> pieces </s> (ids of the cut vocabulary), at most `max` long */
  encode(text: string, max = 96): number[] {
    const out: number[] = [0]; for (const w of clean(text).split(' ')) { if (w) this.word(w, out); if (out.length >= max - 1) break; }
    if (out.length > max - 1) out.length = max - 1; out.push(2); return out;
  }
}

export interface Ort { InferenceSession: any; Tensor: any; env: any; }

export class Neural {
  private constructor(private ort: Ort, private session: any, private tok: Unigram) {}
  /** loads the model; `bytes(url)` fetches a file (the app's own folder `ai/`) */
  static async load(ort: Ort, tok: Unigram, model: ArrayBuffer | Uint8Array): Promise<Neural> {
    const session = await ort.InferenceSession.create(model instanceof Uint8Array ? model : new Uint8Array(model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    return new Neural(ort, session, tok);
  }
  /** unit vectors (384) of the texts; use the prefix «query: » for a question and «passage: » for what is searched */
  async embed(texts: string[], batch = 32): Promise<Float32Array[]> {
    const res: Float32Array[] = [];
    for (let b = 0; b < texts.length; b += batch) {
      const enc = texts.slice(b, b + batch).map((t) => this.tok.encode(t)); const T = Math.max(...enc.map((e) => e.length)); const B = enc.length;
      const ids = new BigInt64Array(B * T).fill(1n), am = new BigInt64Array(B * T), tt = new BigInt64Array(B * T);
      enc.forEach((e, i) => e.forEach((v, j) => { ids[i * T + j] = BigInt(v); am[i * T + j] = 1n; }));
      const T3 = (a: BigInt64Array) => new this.ort.Tensor('int64', a, [B, T]);
      const out = await this.session.run({ input_ids: T3(ids), attention_mask: T3(am), token_type_ids: T3(tt) });
      const h = out.last_hidden_state.data as Float32Array; const D = h.length / (B * T);
      for (let i = 0; i < B; i++) {
        const v = new Float32Array(D); let n = 0;
        for (let j = 0; j < T; j++) if (am[i * T + j]) { n++; for (let d = 0; d < D; d++) v[d] += h[(i * T + j) * D + d]; }
        let norm = 0; for (let d = 0; d < D; d++) { v[d] /= n; norm += v[d] * v[d]; } norm = Math.sqrt(norm) || 1; for (let d = 0; d < D; d++) v[d] /= norm; res.push(v);
      }
    }
    return res;
  }
}

/** vectors of many texts kept as 8-bit numbers (a unit vector loses nothing that matters): 384 bytes each */
export class VectorIndex {
  constructor(private data: Int8Array, readonly dim = 384) {}
  get size() { return this.data.length / this.dim; }
  static quantize(vs: Float32Array[]): Int8Array { const d = vs[0].length; const o = new Int8Array(vs.length * d); vs.forEach((v, i) => { for (let k = 0; k < d; k++) o[i * d + k] = Math.max(-127, Math.min(127, Math.round(v[k] * 127))); }); return o; }
  /** the `k` most similar rows to the unit vector q: [row, cosine][] */
  top(q: Float32Array, k: number): [number, number][] {
    const n = this.size, d = this.dim; const best: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      let s = 0; const o = i * d; for (let j = 0; j < d; j++) s += this.data[o + j] * q[j]; s /= 127;
      if (best.length < k || s > best[best.length - 1][1]) { let p = best.length; while (p > 0 && best[p - 1][1] < s) p--; best.splice(p, 0, [i, s]); if (best.length > k) best.pop(); }
    }
    return best;
  }
}
