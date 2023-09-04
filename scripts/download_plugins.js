//@ts-check
// Helper script to download recently updated plugins
// Used to review code changes for breaking changes.

// 180 is somewhat arbitrary.
const CUTOFF_DAYS = 180;
const CUTOFF_MS = Date.now() - 1000 * 60 * 60 * 24 * CUTOFF_DAYS;

const cp = require("child_process");
const path = require("path");
const https = require("https");
const fs = require("fs");

/**
 * @param {string} command
 * @returns {Promise<string>}
 */
function exec(command) {
    return new Promise((resolve, reject) => {
        cp.exec(command, (err, stdout, stderr) => {
            if (err) reject(err);
            if (stderr.length)
                reject(new Error(`Command: ${command}\n${stderr}`));
            resolve(stdout.trim());
        });
    });
}

async function getPackages(search) {
    const query = `https://www.npmjs.com/search?q=${encodeURIComponent(
        search
    )}`;

    const results = [];
    let total = 0;
    let page = 0;

    do {
        const data = JSON.parse(
            await exec(`curl -s "${query}&page=${page++}" -H "x-spiferack: 1"`)
        );

        total = data.total;
        results.push(...data.objects.map((x) => x.package));
    } while (results.length < total);

    return results;
}

async function getPlugins() {
    const plugins = (
        await Promise.all([
            getPackages("keywords:typedoc-plugin"),
            getPackages("keywords:typedocplugin"),
            getPackages("keywords:typedoc-theme"),
        ])
    ).flat();

    console.log(`Search found ${plugins.length} plugins`);
    for (let i = plugins.length - 1; i >= 0; i--) {
        if (plugins.findIndex((p) => p.name === plugins[i].name) !== i) {
            plugins.splice(i, 1);
        }
    }
    console.log(`Reduced to ${plugins.length} by removing duplicates`);

    return plugins.filter((plugin) => plugin.date.ts > CUTOFF_MS);
}

function getTarballUrl(package) {
    return exec(`npm view ${package.name} dist.tarball`);
}

function downloadTarball(url, outDir) {
    const outFile = path.join(outDir, path.basename(url));

    return new Promise((resolve, reject) => {
        const out = fs.createWriteStream(outFile);
        out.on("finish", () => {
            out.close();
            resolve(outFile);
        });

        https
            .get(url, (response) => {
                response.pipe(out);
            })
            .on("error", (err) => {
                reject(err);
            });
    });
}

// Could do this with node... but this works in my environment which is the only place I
// expect it to be used. If you want to use this, somewhere else, feel free to update.
async function inflate(file) {
    await exec(`gzip -d "${file}"`);
    await fs.promises.mkdir(file.replace(".tgz", ""));
    await exec(
        `tar -C "${file.replace(".tgz", "")}" -xf "${file.replace(
            ".tgz",
            ".tar"
        )}"`
    );
    await fs.promises.rm(file.replace(".tgz", ".tar"));
}

/** @param {string[]} args */
async function main(args) {
    const outDir = path.resolve(args[0] || "../typedoc_plugins");
    const plugins = await getPlugins();
    console.log(
        `Found ${plugins.length} plugins updated in the past ${CUTOFF_DAYS} days.`
    );
    const tarballs = await Promise.all(plugins.map(getTarballUrl));
    console.log(`Downloading tarballs...`);
    await fs.promises.rm(outDir, { recursive: true, force: true });
    await fs.promises.mkdir(outDir, { recursive: true });
    const tarballFiles = await Promise.all(
        tarballs.map((tar) => downloadTarball(tar, outDir))
    );
    console.log(`Inflating...`);
    await Promise.all(tarballFiles.map(inflate));
    console.log(`Done.`);
}

main(process.argv.slice(2)).catch(console.error);
