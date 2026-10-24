/**
 * electron-builder afterPack hook: ad-hoc sign macOS bundles.
 *
 * CI has no Apple Developer certificate, so electron-builder skips signing
 * entirely ("skipped macOS application code signing"). macOS requires at
 * least an ad-hoc signature on arm64 — a completely unsigned app is reported
 * as "damaged" even after `xattr -cr`. Sign with the ad-hoc identity ("-")
 * before the dmg is packed, then verify so a broken seal fails the build.
 */
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSignMac(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log(`[adhoc-sign] signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
  execFileSync(
    'codesign',
    ['--verify', '--deep', '--strict', '--verbose=2', appPath],
    { stdio: 'inherit' }
  );
  console.log('[adhoc-sign] verified');
};
