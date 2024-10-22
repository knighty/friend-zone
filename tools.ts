import { exec } from "child_process";
import { Command } from "commander";
import fs from "fs/promises";
import { bgBlue, bgGreen, bgRed, blue, bold, green, options, SupportLevel } from 'kolorist';
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

type CommandOptions = {
    cwd?: string,
    output?: boolean,
    errors?: boolean,
    errorsInStdOut?: boolean
}

async function runCommand(command: string, options?: CommandOptions) {
    const timer = executionTimer();
    const output = options?.output ?? false;
    const errors = options?.errors ?? true;
    const cwd = options?.cwd ?? "";

    return new Promise<void>((resolve, reject) => {
        const process = exec(command, {
            cwd: cwd,
        })

        let out = "";

        let hasErrors = false;

        process.stdout.setEncoding('utf8');
        process.stdout.on("data", message => {
            if (output) {
                console.log(message);
            } else {
                out += message;
            }
        })

        process.stderr.setEncoding('utf8');
        process.stderr.on("data", err => {
            hasErrors = true;
            if (errors) {
                console.error(err);
            }
        })

        process.on("exit", (code, signal) => {
            if (hasErrors || code != 0) {
                if (options?.errorsInStdOut && out != "") {
                    console.error(out);
                }
                reject();
                return;
            }
            resolve();
            console.log(`Executed in ${blue(timer.end())}`);
        })
    })


    /*await execPromise(command, {
        cwd: cwd,
    }).then(value => {
        if (value.stdout && output) {
            console.log(value.stdout);
        }
        if (value.stderr && errors) {
            console.error(value.stderr);
        }
    }).catch(err => {
        console.error(err);
    });*/
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
    .option('-b, --bundle [package]', 'Bundle', false)
    .option('--verbose', 'Verbose output', false)
    .action(async (options) => {
        try {
            const verbose = options.verbose;
            const timer = executionTimer({
                format: "seconds"
            });

            if (options.pull || options.all) {
                header("Pull code");
                await runCommand(`git pull`, { output: verbose });
            }

            if (options.modules || options.all) {
                header("Install modules");
                subHeader(`main`);
                await runCommand(`npm ci`, { output: verbose });
                subHeader(`shared`);
                await runCommand(`npm ci`, { cwd: path.join(__dirname, "shared"), output: verbose });
                subHeader(`remote-control`);
                await runCommand(`npm ci`, { cwd: path.join(__dirname, "remote-control"), output: verbose });
                subHeader(`server`);
                await runCommand(`npm ci`, { cwd: path.join(__dirname, "server"), output: verbose });
                subHeader(`public`);
                await runCommand(`npm ci`, { cwd: path.join(__dirname, "public"), output: verbose });
            }

            if (options.bundle || options.all) {
                header("Bundle code");

                if (options.bundle === true || options.bundle == "public" || options.bundle == "all") {
                    subHeader("public");
                    await runCommand(`npm run build:dev`, { cwd: path.join(__dirname, "public"), output: verbose, errorsInStdOut: true });
                }

                if (options.bundle === true || options.bundle == "remote-control" || options.bundle == "all") {
                    subHeader("remote-control");
                    await runCommand(`npm run build:dev`, { cwd: path.join(__dirname, "remote-control"), output: verbose, errorsInStdOut: true });
                }
            }

            console.log("");
            console.log(bgGreen(` Completed all tasks in ${bold(timer.end())}) `));
        } catch (e) {
            console.error(bgRed(` There were errors running tasks `));
        }
    });

program.parse();