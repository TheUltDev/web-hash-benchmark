/// <reference lib="webworker"/>

import {blake3} from '../../../lib/awasm-noble-wasm/blake3';
import {runAwasmWorker} from '../../../lib/awasm-worker';

runAwasmWorker(blake3);
