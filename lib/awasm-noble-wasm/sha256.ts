import {mkHash} from '@awasm/noble/hashes-abstract.js';
import {sha256 as def_sha256} from '@awasm/noble/hashes.js';
import mod_sha256 from '@awasm/noble/targets/wasm/sha256.js';

export const sha256 = mkHash(() => mod_sha256({}, undefined), def_sha256, 'wasm');
