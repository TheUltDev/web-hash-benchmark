/// <reference lib="webworker"/>

import {createBLAKE2b} from 'hash-wasm';
import {runHashWasmWorker} from '../../common/wasm-worker';

runHashWasmWorker(createBLAKE2b());
