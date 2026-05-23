/// <reference lib="webworker"/>

import {blake3} from '../../../lib/awasm-noble-threads/blake3';
import {runAwasmWorker} from '../../../lib/awasm-worker';

runAwasmWorker(blake3);
