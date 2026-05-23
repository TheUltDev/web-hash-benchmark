import {mkHash} from '@awasm/noble/hashes-abstract.js';
import {blake3 as def_blake3} from '@awasm/noble/hashes.js';
import mod_blake3 from '@awasm/noble/targets/wasm/blake3.js';

export const blake3 = mkHash(() => mod_blake3({}, undefined), def_blake3, 'wasm');
