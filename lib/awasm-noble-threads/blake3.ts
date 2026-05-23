import {mkHash} from '@awasm/noble/hashes-abstract.js';
import {blake3 as def_blake3} from '@awasm/noble/hashes.js';
import {WP as pool} from '@awasm/noble/workers.js';
import mod_blake3 from '@awasm/noble/targets/wasm_threads/blake3.js';

export const blake3 = mkHash(mod_blake3.bind(null, {}, pool), def_blake3, 'wasm_threads');
