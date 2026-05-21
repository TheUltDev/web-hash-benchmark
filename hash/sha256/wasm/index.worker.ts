/// <reference lib="webworker"/>

import {createSHA256} from 'hash-wasm';
import {runHashWasmWorker} from '../../../lib/wasm-worker';

runHashWasmWorker(createSHA256());
