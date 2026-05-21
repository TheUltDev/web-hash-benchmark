/// <reference lib="webworker"/>

import {createBLAKE3} from 'hash-wasm';
import {runHashWasmWorker} from '../../../lib/wasm-worker';

runHashWasmWorker(createBLAKE3());
