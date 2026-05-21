import HashWorker from './index.worker?worker';
import {createWorkerSession} from '../../common/session';

export default createWorkerSession(() => new HashWorker());
