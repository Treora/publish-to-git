const Promise = require('bluebird');
const childProcess = require('child_process');
const fs = require('fs');
const tar = require('tar');
const path = require('path');
const tmp = require('tmp');

Promise.promisifyAll(childProcess);
Promise.promisifyAll(fs);
Promise.promisifyAll(tar);
Promise.promisifyAll(tmp);

const { execFileAsync, spawn } = childProcess;
const { unlinkAsync } = fs;

tmp.setGracefulCleanup();

function spawnNpmWithOutput(args, options) {
  if(!options.verbose) {
    return execFileAsync('npm', args, options);
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('npm', args, Object.assign(options, {
      stdio: ['inherit', 'pipe', 'inherit'],
      env: Object.assign({}, process.env, Boolean(process.stdout.isTTY) && {
        NPM_CONFIG_COLOR: 'always'
      })
    }));
    let outData = '';
    proc.on('exit', exitCode => {
      if(exitCode === 0) { 
        resolve(outData);
      }
      reject(new Error(`npm failed with error code ${exitCode}`));
    });
    proc.on('error', reject);
    proc.stdout.on('data', data => {
      outData += data.toString('utf8');
    });
  });
}

async function packWithNpm({ sourceDir, targetDir, verbose }) {
  const output = (await spawnNpmWithOutput(['pack', sourceDir], {
    cwd: targetDir,
    verbose
  })).trim().split(/\n/);
  const packedFile = output[output.length - 1];
  const packedFileAbsolute = path.join(path.resolve(targetDir), packedFile);
  
  try {
    await tar.extractAsync({
      strip: 1,
      cwd: targetDir,
      file: packedFileAbsolute
    });
  } finally {
    await unlinkAsync(packedFileAbsolute);
  }
}

async function publish({tags, vtag, version, push, packOptions}, pack = packWithNpm) {
  if (vtag === true || (vtag === undefined && tags.length === 0)) {
    tags.unshift(`v${version}`);
  }

  const tmpRepoDir = await tmp.dirAsync();
  let temporaryRemote = path.basename(tmpRepoDir);

  const git = (...args) => execFileAsync('git', args);
  const gitInTmpRepo = (...args) => execFileAsync('git', args, {
    cwd: tmpRepoDir
  });

  try {
    const gitInitPromise = gitInTmpRepo('init');

    await pack(Object.assign({
      sourceDir: process.cwd(),
      targetDir: tmpRepoDir,
    }, packOptions));

    await gitInitPromise;
    await gitInTmpRepo('add', '-A');

    const currentCommitMessage = (await git('log', '-n', '1', '--pretty=oneline', '--decorate=full')).trim();
    const message = `Published by publish-to-git
${currentCommitMessage}`;

    await gitInTmpRepo('commit', '-m', message);
    
    await git('remote', 'add', '-f', temporaryRemote, tmpRepoDir);

    const forceOptions = push.force ? ['-f'] : [];

    for (const tag of tags) {
      await git('tag', ...forceOptions, tag, `${temporaryRemote}/master`);
    }

    if (push) {
      console.warn(`Pushing to remote ${push.remote}`);

      try {
        await git('push', ...forceOptions, push.remote || 'origin', ...tags);
      } catch(err) {
        await git('tag', '-d', ...tags);
        throw err;
      }
      console.log(`Pushed tag to ${push.remote} with tag(s): ${tags.join(' ')}`);
    } else {
      console.log(`Created local tag(s): ${tags.join(' ')}`);
    }
  } finally {
    try {
      await git('remote', 'remove', temporaryRemote);
    } catch(err) {}
  }
}

module.exports = { publish, packWithNpm };
