import {mkHash} from '@awasm/noble/hashes-abstract.js';
import {blake2b as def_blake2b} from '@awasm/noble/hashes.js';
import {WP as pool} from '@awasm/noble/workers.js';
import mod_blake2b from '@awasm/noble/targets/wasm_threads/blake2b.js';

export const blake2b = mkHash(mod_blake2b.bind(null, {}, pool), def_blake2b, 'wasm_threads');
