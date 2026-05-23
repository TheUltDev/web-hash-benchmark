/// <reference lib="webworker"/>

import {blake2b} from '../../../lib/awasm-noble-wasm/blake2b';
import {runAwasmWorker} from '../../../lib/awasm-worker';

runAwasmWorker(blake2b);
