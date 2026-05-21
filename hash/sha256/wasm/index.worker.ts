/// <reference lib="webworker"/>

import {createSHA256} from 'hash-wasm';
import {runHashWasmWorker} from '../../common/wasm-worker';

runHashWasmWorker(createSHA256());
