#!/usr/bin/env node
import { main } from '../src/node/cli.mjs';

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  process.stderr.write(`openspec-assess requires Node.js 22 or later (found ${process.versions.node}).\n`);
  process.exit(2);
}
process.exitCode = await main(process.argv.slice(2));
