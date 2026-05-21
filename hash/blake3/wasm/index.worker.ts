/// <reference lib="webworker"/>

import {createBLAKE3} from 'hash-wasm';
import {runHashWasmWorker} from '../../common/wasm-worker';

runHashWasmWorker(createBLAKE3());
