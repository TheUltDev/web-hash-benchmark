/// <reference lib="webworker"/>

import {createSHA256} from '@ult/hash-wasm';
import {runHashWasmWorker} from '../../../lib/wasm-worker';

runHashWasmWorker(createSHA256());
