import type {FileSystemIn, HashResult, HashWorkerIn} from './types';

export function createWorkerSession(ctor: () => Worker) {
  return {
    create: () => {
      const worker = ctor();
      let busy: Promise<unknown> = Promise.resolve();

      function send<T>(
        message: HashWorkerIn,
        handlers: {
          complete: (data: unknown) => T;
          progress?: (bytes: number, total: number) => void;
        },
      ): Promise<T> {
        const run = busy.then(
          () =>
            new Promise<T>((resolve, reject) => {
              worker.onmessage = (e) => {
                switch (e.data.type) {
                  case 'hash::progress': {
                    const {bytes, total} = e.data.payload;
                    handlers.progress?.(bytes, total);
                    break;
                  }
                  case 'hash::warmed':
                  case 'hash::complete': {
                    resolve(handlers.complete(e.data.payload));
                    break;
                  }
                  case 'hash::failure': {
                    reject(e.data.payload);
                    break;
                  }
                }
              };
              worker.onerror = (e) => {
                reject(e.message ? e : new Error('Hash worker failed'));
              };
              worker.postMessage(message);
            }),
        );
        busy = run.catch(() => {});
        return run;
      }

      return {
        warmup: () =>
          send<void>({kind: 'warmup'}, {complete: () => undefined}),
        hash: (
          input: FileSystemIn,
          progress?: (bytes: number, total: number) => void,
          chunkSize?: number,
        ) =>
          send<HashResult>(
            {kind: 'hash', input, chunkSize},
            {complete: (payload) => payload as HashResult, progress},
          ),
        dispose: () => worker.terminate(),
      };
    },
  };
}
