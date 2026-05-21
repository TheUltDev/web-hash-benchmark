/// <reference lib="webworker"/>

import {createSHA256} from '@ult/hash-wasm';
import {runHashWasmWorker} from '../../common/wasm-worker';

runHashWasmWorker(createSHA256());
