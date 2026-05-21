/// <reference lib="webworker"/>

import {createBLAKE3} from '@ult/hash-wasm';
import {runHashWasmWorker} from '../../../lib/wasm-worker';

runHashWasmWorker(createBLAKE3());
