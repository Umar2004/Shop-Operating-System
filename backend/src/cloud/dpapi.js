const { spawn } = require('child_process');

// Windows DPAPI (CurrentUser scope) through Windows PowerShell, so no native module is needed.
// The data goes in on stdin and comes back on stdout: it never appears on a command line or in a file.
const ENTROPY = 'SOP-gdrive-v1';
const supported = process.platform === 'win32';

function run(op, input) {
  return new Promise((resolve, reject) => {
    const script = [
      "$ErrorActionPreference = 'Stop'",
      'Add-Type -AssemblyName System.Security',
      '$in = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
      `$ent = [Text.Encoding]::UTF8.GetBytes('${ENTROPY}')`,
      `$out = [Security.Cryptography.ProtectedData]::${op}($in, $ent, [Security.Cryptography.DataProtectionScope]::CurrentUser)`,
      '[Console]::Out.Write([Convert]::ToBase64String($out))',
    ].join('; ');
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
    });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill(), 30_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 && out) resolve(Buffer.from(out.trim(), 'base64'));
      else reject(new Error(`DPAPI ${op} failed${err ? `: ${err.split('\n')[0].trim()}` : ''}`));
    });
    child.stdin.end(input.toString('base64'));
  });
}

const protect = (buf) => (supported ? run('Protect', buf) : Promise.reject(new Error('Encrypted storage needs Windows')));
const unprotect = (buf) => (supported ? run('Unprotect', buf) : Promise.reject(new Error('Encrypted storage needs Windows')));

module.exports = { supported, protect, unprotect };
