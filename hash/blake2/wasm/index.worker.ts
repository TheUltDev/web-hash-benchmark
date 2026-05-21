/// <reference lib="webworker"/>

import {createBLAKE2b} from 'hash-wasm';
import {runHashWasmWorker} from '../../../lib/wasm-worker';

runHashWasmWorker(createBLAKE2b());
