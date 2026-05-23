import {mkHash} from '@awasm/noble/hashes-abstract.js';
import {sha256 as def_sha256} from '@awasm/noble/hashes.js';
import {WP as pool} from '@awasm/noble/workers.js';
import mod_sha256 from '@awasm/noble/targets/wasm_threads/sha256.js';

export const sha256 = mkHash(mod_sha256.bind(null, {}, pool), def_sha256, 'wasm_threads');
