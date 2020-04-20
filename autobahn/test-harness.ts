import dotenv from 'dotenv';
dotenv.config();

import death from 'death';

// @ts-ignore
import { WS, Platform } from '../dist/milo.node';

import mergeCustomConfig from './merge-custom-config';
mergeCustomConfig(Platform);

import autobahn from './runner';
import { setAgent, getVersion } from './runner/get-agent';
import autobahnTestSuite from './start';
import { killContext, GlobalContext } from './context';
import { killDocker } from './runner/docker/kill';
import { clearReports, getReports, testPass, getId } from './autobahn-reports';
import getNrdpAgent from './runner/nrdp/agent';
import testNrdp from './runner/nrdp';

const isNrdpRun = process.argv[2] === 'nrdp';

const ON_DEATH = death({ uncaughtException: true });

// Attempts to kill all autobahn testsuites
ON_DEATH(() => {
    if (process.env.SELF_MANAGED_AUTOBAHN !== 'true') {
        killDocker();
    }

    killContext(GlobalContext);

    process.exit();
});

async function wait(ms: number) {
    return new Promise(res => {
        setTimeout(res, ms);
    });
}

async function run() {
    let agent = `test_harness_${getVersion()}`;
    Platform.log("Testing Autobahn with", process.env.CASES);
    Platform.log("Agent", agent);
    Platform.log("If this is wrong, please edit your .env file.");

    setAgent(agent);

    await wait(1000);
    clearReports(Platform);

    if (process.env.SELF_MANAGED_AUTOBAHN !== 'true') {
        await autobahnTestSuite();
    }

    let cases = -1;
    if (isNrdpRun) {
        agent = getNrdpAgent();
        cases = await testNrdp(Platform);
    }
    else {
        cases = await autobahn(WS, {
            updateReport: true,
            port: 9001,
            Platform,
            agent,
        });
    }

    Platform.log("examining reports");
    const reports = await getReports(agent);

    if (reports.length < cases) {
        throw new Error(`Expected ${cases} to be reported, but got ${reports.length}`);
    }

    const fails = reports.map(r => {
        if (!testPass(r)) {
            return getId(r);
        }

        return false;
    }).filter(x => x) as string[];

    Platform.error("examining reports finished, failures are ", fails);
    if (fails.length) {
        Platform.log(fails.length, "Test cases have failed:", fails.join(', '));
        process.exit(1);
    }

    Platform.log("Successfully passed", process.env.CASES, "autobahn tests");
    killContext(GlobalContext);
    process.exit(0);
}

run();

