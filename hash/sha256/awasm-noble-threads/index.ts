import HashWorker from './index.worker?worker';
import {createWorkerSession} from '../../../lib/session';

export default createWorkerSession(() => new HashWorker());
