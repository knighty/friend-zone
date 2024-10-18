import { exec } from "child_process";
import { Command } from "commander";
import fs from "fs/promises";
import { bgBlue, bgGreen, blue, bold, green, options, SupportLevel } from 'kolorist';
import path from "path";
import { promisify } from "util";
import { log } from "./shared/logger";
import { executionTimer } from "./shared/utils";
options.enabled = true;
options.supportLevel = SupportLevel.ansi256;

const program = new Command();

const execPromise = promisify(exec);

program
    .name('friend-zone')
    .description('CLI for some FriendZone utilities')
    .version('0.8.0');

async function runCommand(command: string, cwd?: string) {
    const timer = executionTimer();
    await execPromise(command, {
        cwd: cwd,
    }).then(value => {
        if (value.stderr) {
            console.error(value.stderr);
        }
    });
    console.log(`Executed in ${blue(timer.end())}`);
}

function header(text: string) {
    console.log("");
    console.log(bgBlue(` ${text}`.padEnd(40, " ")));
}

function subHeader(text: string) {
    console.log(blue(bold(`- ${text}`)));
}

program.command('clear-temp-files')
    .description("Clear temporary files")
    .option('--verbose', 'Verbose output', false)
    .action(async (options) => {
        header("Clearing temporary files");

        const dirs: Record<string, string> = {
            "tts/output/": "TTS output files",
            "public/downloads/images": "Downloads",
        }

        let num = 0;
        for (let dir in dirs) {
            subHeader(dirs[dir]);
            dir = path.join(__dirname, dir);
            const files = await fs.readdir(dir);
            for (let file of files) {
                await fs.rm(path.join(dir, file));
                if (options.verbose) {
                    log.info(`Deleted: ${green(file)}`);
                }
                num++;
            }
        }

        console.log(bgGreen(` Deleted ${bold(num)} files `));
    })

program.command('install')
    .description('Install')
    .option('-a, --all', 'Do all steps', false)
    .option('-p, --pull', 'Pull from github', false)
    .option('-m, --modules', 'Install modules', false)
    .option('-b, --bundle', 'Bundle', false)
    .action(async (options) => {
        const timer = executionTimer({
            format: "seconds"
        });

        if (options.pull || options.all) {
            header("Pull code");
            await runCommand(`git pull`);
        }

        if (options.modules || options.all) {
            header("Install modules");
            subHeader(`main`);
            await runCommand(`npm ci`, path.join(__dirname));
            subHeader(`shared`);
            await runCommand(`npm ci`, path.join(__dirname, "shared"));
            subHeader(`remote-control`);
            await runCommand(`npm ci`, path.join(__dirname, "remote-control"));
            subHeader(`server`);
            await runCommand(`npm ci`, path.join(__dirname, "server"));
            subHeader(`public`);
            await runCommand(`npm ci`, path.join(__dirname, "public"));
        }

        if (options.bundle || options.all) {
            header("Bundle code");

            subHeader("public");
            await runCommand(`npm run build:dev`, path.join(__dirname, "public"));

            subHeader("remote-control");
            await runCommand(`npm run build:dev`, path.join(__dirname, "remote-control"));
        }

        console.log("");
        console.log(bgGreen(` Completed all tasks in ${bold(timer.end())}) `));
    });

program.parse();