// tslint:disable no-console
import execa from 'execa';
import * as path from 'path';
import { timer } from 'rxjs';
import yargs from 'yargs';

const argv = yargs
  .boolean('report')
  .describe('report', 'Write out test reports.')
  .default('report', false)
  .boolean('coverage')
  .describe('coverage', 'Write coverage to .nyc_output.')
  .default('coverage', false)
  .boolean('express')
  .describe('express', 'Run quick test on a single course')
  .default('express', false).argv;

const runCypress = async ({ report, coverage }: { readonly report: boolean; readonly coverage: boolean }) => {
  // tslint:disable-next-line no-unused
  const { NODE_OPTIONS, TS_NODE_PROJECT, ...newEnv } = process.env;
  const cypressRetries = '3';
  const finalEnv = { ...newEnv, CYPRESS_RETRIES: cypressRetries };
  let command = ['cypress', 'run', '--spec'];
  command = argv.express
    ? command.concat(['cypress/integration/TokenomicsCourse/Lesson2/Chapter5.ts'])
    : command.concat(['cypress/integration/**/*']);
  if (report) {
    command = command.concat([
      '--reporter',
      'mocha-multi-reporters',
      '--reporter-options',
      `configFile=${path.resolve(__dirname, '..', 'mocha.json')}`,
    ]);
  }
  if (coverage) {
    command = command.concat(['--env', `coverageDir=${path.resolve(process.cwd(), '.nyc_output')}`]);
  }

  console.log(`$ CYPRESS_RETRIES=${cypressRetries} yarn ${command.join(' ')}`);
  const proc = execa('yarn', command, {
    env: finalEnv,
    extendEnv: false,
    cwd: path.resolve(__dirname, '..'),
  });

  if (proc.stdout !== null) {
    proc.stdout.pipe(process.stdout);
  }
  if (proc.stderr !== null) {
    proc.stderr.pipe(process.stderr);
  }

  await proc;
};

// tslint:disable-next-line readonly-array
const mutableCleanup: Array<() => Promise<void> | void> = [];

// tslint:disable-next-line no-let
let shuttingDown = false;
const shutdown = (exitCode: number) => {
  if (!shuttingDown) {
    shuttingDown = true;
    console.log('Shutting down...');
    Promise.all(mutableCleanup.map((callback) => callback()))
      .then(() => {
        process.exit(exitCode);
      })
      .catch((error) => {
        console.error(error);
        process.exit(1);
      });
  }
};

process.on('uncaughtException', (error) => {
  console.error(error);
  shutdown(1);
});

process.on('unhandledRejection', (error) => {
  console.error(error);
});

process.on('SIGINT', () => {
  console.log('\nSIGINT: Exiting...');
  shutdown(0);
});

process.on('SIGTERM', () => {
  console.log('\nSIGTERM: Exiting...');
  shutdown(0);
});

const createProcess = (command: string) => {
  console.log(`$ yarn ${command}`);
  const returnProc = execa('yarn', [command]);
  mutableCleanup.push(async () => {
    returnProc.kill();
    await returnProc;
  });
  return returnProc;
};

const run = async ({ report, coverage }: { readonly report: boolean; readonly coverage: boolean }) => {
  // const overlayProc = createProcess('website:start-overlay-prod');
  // await overlayProc;
  // const workersProc = createProcess('website:start-workers-prod-ci');
  // await workersProc;
  // const toolsProc = createProcess('website:start-tools-prod-ci');
  // await toolsProc;
  const previewProc = createProcess('website:start-preview-prod-ci');
  await timer(10 * 60 * 1000);
  const testRunnerProc = createProcess('website:start-testRunner-prod-ci');
  await timer(8 * 60 * 1000);
  const serverProc = createProcess('website:start-server');
  await timer(10 * 60 * 1000);
  const staticProc = createProcess('website:start-static-prod-ci');
  await timer(40 * 60 * 1000).toPromise();
  await runCypress({ report, coverage });
};

run({ report: argv.report, coverage: argv.coverage })
  .then(() => shutdown(0))
  .catch((error) => {
    console.error(error);
    shutdown(1);
  });
