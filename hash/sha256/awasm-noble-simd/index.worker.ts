/// <reference lib="webworker"/>

import {sha256} from '../../../lib/awasm-noble-wasm/sha256';
import {runAwasmWorker} from '../../../lib/awasm-worker';

runAwasmWorker(sha256);
