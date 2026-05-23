import {mkHash} from '@awasm/noble/hashes-abstract.js';
import {blake2b as def_blake2b} from '@awasm/noble/hashes.js';
import mod_blake2b from '@awasm/noble/targets/wasm/blake2b.js';

export const blake2b = mkHash(() => mod_blake2b({}, undefined), def_blake2b, 'wasm');
