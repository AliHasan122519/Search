"""Builds the on-device semantic model of سراج from the open-source multilingual-e5-small (MIT) by cutting its vocabulary to Arabic.
   python3 scripts/build_semantic.py <dir with onnx/model_quantized.onnx and tokenizer.json> <output dir>
   Output: e5-ar.onnx (the same network; only the unused rows of the word-embedding table are dropped) and vocab.json ([piece, score] per new id).
   The first four ids stay <s> <pad> </s> <unk>. The original id → new id map is written too (for checking against the full model)."""
import sys, json, re
sys.path.insert(0, '/tmp/claude-0/pylib')
import numpy as np, onnx
from onnx import numpy_helper
src, out = sys.argv[1], sys.argv[2]
tok = json.load(open(f'{src}/tokenizer.json')); vocab = tok['model']['vocab']
AR = re.compile(r'[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]')
def ok_char(c): o = ord(c); return o < 0x250 or 0x2000 <= o <= 0x206F or AR.match(c) is not None
keep = [0, 1, 2, 3]
for i, (p, s) in enumerate(vocab):
    if i < 4: continue
    core = p.replace('▁', '')
    if AR.search(p): keep.append(i)
    elif p == '▁' or (core and len(core) <= 1 and ok_char(core)): keep.append(i)   # the bare word mark and every single character
    elif re.fullmatch(r'▁?[A-Za-z0-9]{1,3}', p): keep.append(i)
# the two fixed prefixes of the e5 models («query: » / «passage: ») must tokenize exactly as in the full model
from tokenizers import Tokenizer
_t = Tokenizer.from_file(f'{src}/tokenizer.json')
for pre in ('query: ', 'passage: '): keep += _t.encode(pre).ids
keep = sorted(set(keep)); print('kept pieces', len(keep))
m = onnx.load(f'{src}/onnx/model_quantized.onnx')
for init in m.graph.initializer:
    if init.name == 'embeddings.word_embeddings.weight_quantized':
        w = numpy_helper.to_array(init); new = numpy_helper.from_array(np.ascontiguousarray(w[keep]), init.name)
        init.CopyFrom(new); print('embedding table', w.shape, '→', new.dims)
onnx.save(m, f'{out}/e5-ar.onnx')
json.dump([[vocab[i][0], round(vocab[i][1], 4)] for i in keep], open(f'{out}/vocab.json', 'w'), ensure_ascii=False, separators=(',', ':'))
json.dump(keep, open(f'{out}/old_ids.json', 'w'))
