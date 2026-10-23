#!/usr/bin/env bash
# Downloads what `d3 compile` and the golden harness read into $1, for the size $2 (nano or lite),
# each file pinned by revision and checked by sha256 (files already present are only checked):
# vLLM Semantic Router's d3 checkpoint (its backbone in bf16, its answer-code readout, its decision
# configuration, tokenizer, processor settings and license) and its own runtime, the reference.
set -euo pipefail
DIR="$1"
case "$2" in
  nano) REVISION=462efc366229ea268cf4eed3738b3fc4415e4817; FILES="
7269b3260f1106f3443bfdb028a76143be2e679db3f29a31f4dfd1d595f03155  model.safetensors
662e8a26d8016b2d479f1ca66bf64944603316c2b5e074ab7ac3304b8ae045e9  readout.safetensors
9175a0f42d5886def9c8429fdf8b0be58a3c97d106b94520e2ac38fe326302bf  decision_config.json
9caa6ab8956c859c3852328dda6322893a18b30826d3916db91d938d6c74ac4f  config.json
5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42  tokenizer.json
49e2b6e395f959f077f1e992b338919c0d4a9732fc6e613995e06557f843500c  tokenizer_config.json
273d8e0e683b885071fb17e08d71e5f2a5ddfb5309756181681de4f5a1822d80  chat_template.jinja
27225450ac9c6529872ee1924fcb0962ff5634834f817040f444118116f4e516  preprocessor_config.json
7768af27c1fafa9cc9011c1dc20067e03f8915e03b63504550e11d5066986d13  video_preprocessor_config.json
ce99b4cb2983d118806ce0a8b777a35b093e2000a503ebde25853284c9dfa003  vocab.json
a9d356d7bdf1ef4949e3e748e95b8e10ad9d4e2e838eddc38a0a7b6b94d1db8d  merges.txt
c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4  LICENSE
300b6105c41a1843653e40be644c3d54e06288b25199373e04143530cc3db366  NOTICE
db2139c5b5b7060f8f95150ec70ca2fe7e69e6bf4249e5766df5388bf35977f2  MODEL_MANIFEST.json
adf7f7aa085674b5682e492d8b2e3cc4f11c67b0d153515c742e907e9b550917  d3_runtime.py
3badfbc70561bb3f5b8ec16a11d2c455b96ddb32caace0a8a54ca102eae1f3fa  d3_format.py
68a1fb9a2c3bde9ac2763bf504decae592ca12722698fbde1b39a31262955535  d3_fast.py
8f7534ca1e1846ebf7c4c73058002f3be4dbf0d5d426f0815150ae0cbe7677bd  d3_kernels.py
086238942762df45047a32cd9a8e2bedd9b63167eb40be260c776de567979f53  d3_engine.py
f8f8db23ff58f1a990ffa24977d744a50e1b4446d02a64c22070967705b6dbef  modeling_d3.py
" ;;
  lite) REVISION=03560c26f5199c3c04129a2ccb38960c913635e0; FILES="
ca6222dbf2b72899ae45580ed84d26d1f0e69a8de212edda295072000e34a4c2  model-00001-of-00001.safetensors
fe11cfac5c79b6a83e35b707581b1260214279bb22b003c215c62719186ef629  readout.safetensors
30b6095b945d5a93697868afdf9be9123ea892085fbaff3078112c48da20dc6b  decision_config.json
a9071195384e1fc2c68f9fe0fae007a22182ab77eb14fe8228a1a24b37d3cee9  config.json
5f9e4d4901a92b997e463c1f46055088b6cca5ca61a6522d1b9f64c4bb81cb42  tokenizer.json
49e2b6e395f959f077f1e992b338919c0d4a9732fc6e613995e06557f843500c  tokenizer_config.json
273d8e0e683b885071fb17e08d71e5f2a5ddfb5309756181681de4f5a1822d80  chat_template.jinja
27225450ac9c6529872ee1924fcb0962ff5634834f817040f444118116f4e516  preprocessor_config.json
7768af27c1fafa9cc9011c1dc20067e03f8915e03b63504550e11d5066986d13  video_preprocessor_config.json
ce99b4cb2983d118806ce0a8b777a35b093e2000a503ebde25853284c9dfa003  vocab.json
a9d356d7bdf1ef4949e3e748e95b8e10ad9d4e2e838eddc38a0a7b6b94d1db8d  merges.txt
c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4  LICENSE
e7fecd68cfb3c894924d48c642230cd2b96d3cf03ecc13907f5bcc55d52f3a9f  NOTICE
31f0ff94ff26619c0a063ccac803edcfe34c56c92e5c9c50b703b62893f125dd  MODEL_MANIFEST.json
adf7f7aa085674b5682e492d8b2e3cc4f11c67b0d153515c742e907e9b550917  d3_runtime.py
3badfbc70561bb3f5b8ec16a11d2c455b96ddb32caace0a8a54ca102eae1f3fa  d3_format.py
68a1fb9a2c3bde9ac2763bf504decae592ca12722698fbde1b39a31262955535  d3_fast.py
8f7534ca1e1846ebf7c4c73058002f3be4dbf0d5d426f0815150ae0cbe7677bd  d3_kernels.py
086238942762df45047a32cd9a8e2bedd9b63167eb40be260c776de567979f53  d3_engine.py
f8f8db23ff58f1a990ffa24977d744a50e1b4446d02a64c22070967705b6dbef  modeling_d3.py
" ;;
  *) echo "usage: fetch-checkpoint.sh <dir> nano|lite" >&2; exit 1 ;;
esac
MODEL="https://huggingface.co/vllm-sr/d3-$2/resolve/$REVISION"
mkdir -p "$DIR"
while read -r _ file; do
  if [ -z "$file" ] || [ -s "$DIR/$file" ]; then continue; fi
  echo "downloading $file"
  curl -fsSL --retry 3 -o "$DIR/$file.part" "$MODEL/$file"
  mv "$DIR/$file.part" "$DIR/$file"
done <<< "$FILES"
(cd "$DIR" && awk 'NF { print $1 "  " $2 }' <<< "$FILES" | shasum -a 256 -c --quiet -)
