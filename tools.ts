import { exec } from "child_process";
import { Command } from "commander";
import fs from "fs/promises";
import { bgGreen, bgRed, bold, green, options, SupportLevel } from 'kolorist';
import path from "path";
import { from, ignoreElements, Observable, tap } from "rxjs";
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

function runCommand(command: string, options?: CommandOptions): Observable<TaskEvent> {
    const output = options?.output ?? false;
    const errors = options?.errors ?? true;
    const cwd = options?.cwd ?? "";

    return new Observable<TaskEvent>(subscriber => {
        const process = exec(command, {
            cwd: cwd,
        })

        let out = "";

        let hasErrors = false;

        process.stdout.setEncoding('utf8');
        process.stdout.on("data", message => {
            if (output) {
                subscriber.next({
                    type: "output",
                    output: message
                });
            } else {
                out += message;
            }
        })

        process.stderr.setEncoding('utf8');
        process.stderr.on("data", err => {
            hasErrors = true;
            if (errors) {
                subscriber.error(err);
            }
        })

        process.on("exit", (code, signal) => {
            if (hasErrors || code != 0) {
                if (options?.errorsInStdOut && out != "") {
                    subscriber.next({
                        type: "error",
                        output: out
                    });
                }
                return;
            }
            subscriber.complete();
        })
    })
}

type BaseTaskEvent<T extends string> = {
    type: T
}

type ProgressEvent = BaseTaskEvent<"progress"> & {
    total: number,
    done: number
}

type OutputEvent = BaseTaskEvent<"output"> & {
    output: string
}

type ErrorEvent = BaseTaskEvent<"error"> & {
    output: string
}

type TaskEvent = ProgressEvent | OutputEvent | ErrorEvent;

type Task = {
    name: string,
    run?: () => Observable<ProgressEvent | OutputEvent | ErrorEvent>,
    tasks?: Tasks
}

type Tasks = Task[]

async function runTasks(tasks: Tasks, level = 0) {
    let i = 1;
    for (let task of tasks) {
        let render = (text: string) => text;
        if (level == 0) {
            header(`${i++}/${tasks.length} ◈ ${task.name}`);
        }
        if (level == 1) {
            subHeader(`${i++}/${tasks.length} ◈ ${task.name}`);
            /*render = (text: string) => {
                const segments = text.split("\n");
                const result: string[] = [];
                for (let segment of segments) {
                    while (segment.length > 0) {
                        result.push(segment.substring(0, process.stdout.columns));
                        segment = segment.substring(process.stdout.columns - 4);
                    }
                }
                return result.map(r => `${borders.double[5]} ${r} ${borders.double[5]}`).join("\n");
            };*/
        }

        if (task.run) {
            await new Promise<void>((resolve, reject) => {
                const timer = executionTimer();
                task.run().pipe(
                    tap(event => {
                        switch (event.type) {
                            case "error": {
                                console.error(render(event.output));
                                reject();
                            } break;

                            case "output": {
                                console.log(render(event.output));
                            } break;

                            case "progress": {
                            } break;
                        }
                    })
                ).subscribe({
                    complete() {
                        console.log(`Executed in ${bold(timer.end())}`);
                        resolve();
                    },
                });
            })
        }

        if (task.tasks) {
            await runTasks(task.tasks, level + 1);
        }
    }
}

type Border = {
    tl: string,
    tr: string,
    bl: string,
    br: string,
    h: string,
    v: string
}
const borders: Record<string, Border> = {
    //double: ["╔", "╗", "╚", "╝", "═", "║"],
    //light: ["┌", "┐", "└", "┘", "─", "│"],
    double: {
        tl: '╔',
        tr: '╗',
        br: '╝',
        bl: '╚',
        h: '═',
        v: '║'
    },
    rounded: {
        tl: '╭',
        tr: '╮',
        br: '╯',
        bl: '╰',
        h: '─',
        v: '│'
    }
}

function pad(text: string, length: number) {
    const len = text.replace(/[^a-zA-Z0-9 \*\.]+/gi, "").length;
    console.log(len);
    console.log(text.length);
    return text + " ".repeat(length - len);
}

function margin(text: string, size = 1) {
    return " ".repeat(size) + text + " ".repeat(size);
}

function borderedBox(text: (length: number) => string, border: Border, color: (text: string) => string = text => text) {
    console.log(color(border.tl + border.h.repeat(process.stdout.columns - 2) + border.tr));
    console.log(color(border.v) + " " + text(process.stdout.columns - 4) + " " + color(border.v));
    console.log(color(border.bl + border.h.repeat(process.stdout.columns - 2) + border.br));
}

function header(text: string) {
    borderedBox(length => margin(text).padEnd(length, " "), borders.rounded)
}

function success(text: string) {
    borderedBox(length => green(bold(margin(text).padEnd(length, " "))), borders.rounded, green);
}

function subHeader(text: string) {
    console.log(borders.double.h + "╡" + (bold(margin(text))) + "╞" + borders.double.h.repeat(process.stdout.columns - text.length - 5));
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

function observeCommand(command: Promise<void>): Observable<TaskEvent> {
    return from(command).pipe(
        ignoreElements()
    );
}

program.command('install')
    .description('Install')
    .option('-a, --all', 'Do all steps', false)
    .option('-p, --pull', 'Pull from github', false)
    .option('-m, --modules', 'Install modules', false)
    .option('-b, --bundle [package]', 'Bundle', false)
    .option('--verbose', 'Verbose output', false)
    .action(async (options) => {
        try {
            const tasks: Tasks = [];

            const readline = require('readline')
            const blank = '\n'.repeat(process.stdout.rows)
            console.log(blank)
            readline.cursorTo(process.stdout, 0, 0)
            readline.clearScreenDown(process.stdout)

            const verbose = options.verbose;
            const timer = executionTimer({
                format: "seconds"
            });

            if (options.pull || options.all) {
                header("Pull code");
                await runCommand(`git pull`, { output: verbose });
            }

            if (options.modules || options.all) {
                tasks.push({
                    name: "Install Modules",
                    tasks: [
                        {
                            name: "main",
                            run: () => runCommand(`npm ci`, { output: verbose })
                        },
                        {
                            name: "shared",
                            run: () => runCommand(`npm ci`, { cwd: path.join(__dirname, "shared"), output: verbose })
                        },
                        {
                            name: "remote-control",
                            run: () => runCommand(`npm ci`, { cwd: path.join(__dirname, "remote-control"), output: verbose })
                        },
                        {
                            name: "server",
                            run: () => runCommand(`npm ci`, { cwd: path.join(__dirname, "server"), output: verbose })
                        },
                        {
                            name: "public",
                            run: () => runCommand(`npm ci`, { cwd: path.join(__dirname, "public"), output: verbose })
                        },
                    ]
                });
            }

            if (options.bundle || options.all) {
                const bundleTasks = [];

                if (options.bundle === true || options.bundle == "public" || options.bundle == "all") {
                    bundleTasks.push({
                        name: "public",
                        run: () => runCommand(`npm run build:dev`, { cwd: path.join(__dirname, "public"), output: verbose, errorsInStdOut: true })
                    })
                }

                if (options.bundle === true || options.bundle == "remote-control" || options.bundle == "all") {
                    bundleTasks.push(
                        {
                            name: "remote-control",
                            run: () => runCommand(`npm run build:dev`, { cwd: path.join(__dirname, "remote-control"), output: verbose, errorsInStdOut: true })
                        }
                    )
                }

                tasks.push({
                    name: "Bundle Code",
                    tasks: bundleTasks
                });
            }

            await runTasks(tasks);

            success(`Completed all tasks in ${timer.end()}`);
        } catch (e) {
            console.error(bgRed(` There were errors running tasks `.padEnd(process.stdout.columns, " ")));
        }
    });

program.parse();