#!/usr/bin/env node
const { publish } = require('./');
const yargs = require('yargs');
const argv = yargs
  .usage('Usage: $0')
  .example('$0 --tag v2.1.3 latest --no-push     # by default the version from package.json is used')
  .example('$0 --remote https://USER:GITHUB_TOKEN@github.com/USER/REPO')
  .example('$0 --force    # useful in CI and when we want to override the same tag which triggered the build')
  .describe('remote', 'Git remote, may be remote name or full URL to the repo')
  .default('remote', 'origin')
  .describe('tag', 'Tag name(s) to which src will be published, for example: v1.2.3 latest stable (if none are provided, the version from package.json will be used; see --vtag)')
  .describe('vtag', 'Tag with the version from package.json (defaults to true if no --tag is passed)')
  .describe('push', 'Push update to the git remote (pass --no-push to disable)')
  .describe('force', 'Override any existing tag on the remote as well as locally (git tag -f, git push -f)')
  .array('tag')
  .boolean('vtag')
  .boolean('push')
  .boolean('force')
  .default('push', 'true')
  .wrap(yargs.terminalWidth())
  .argv;

const path = require('path');
const packageJson = require(path.join(process.cwd(), '/package.json'));

publish({
  tags: argv.tag,
  vtag: argv.vtag,
  name: packageJson.name,
  version: packageJson.version,
  push: argv.push && {
    remote: argv.remote,
    force: argv.force,
  },
  packOptions: {
    verbose: true
  }
}).catch(err => {
  if (err.cmd) {
    console.error(err.message);
    if (err.cmd.match(/^git push/)) {
      console.warn(`Cleaned up unpushed tag(s) - please try again`);
    }
  } else {
    console.error(err);
  }
  process.exit(1);
});