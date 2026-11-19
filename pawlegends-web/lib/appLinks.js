// Party links open the app (docs/plans/moba/DEEP-LINKS.md): the association files built from app-links.json.
// CommonJS, no dependencies: scripts/app-links.mjs writes and checks the files, the unit tests read the same rules.

/** A SHA-256 certificate fingerprint as Play Console shows it: 32 bytes, upper-case hex, colon-separated. */
const SHA256 = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const TEAM = /^[A-Z0-9]{10}$/;
const BUNDLE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i;

/** Problems in the config, as lines; empty when it is fine. A placeholder or a mistyped fingerprint is a problem. */
function problems(cfg) {
  const out = [];
  const ios = (cfg && cfg.ios) || {};
  const android = (cfg && cfg.android) || {};
  if (!TEAM.test(String(ios.teamId))) out.push(`ios.teamId "${ios.teamId}" is not a 10-character Apple Team ID`);
  if (!BUNDLE.test(String(ios.bundleId))) out.push(`ios.bundleId "${ios.bundleId}" is not a bundle id`);
  if (!Array.isArray(ios.paths) || !ios.paths.length || ios.paths.some((p) => typeof p !== "string" || !p.startsWith("/")))
    out.push("ios.paths must list paths starting with /");
  if (!BUNDLE.test(String(android.package))) out.push(`android.package "${android.package}" is not a package name`);
  if (!Array.isArray(android.sha256)) out.push("android.sha256 must be a list (empty until the founder adds the Play fingerprints)");
  else
    for (const f of android.sha256)
      if (typeof f !== "string" || !SHA256.test(f))
        out.push(`android.sha256 "${f}" is not a SHA-256 fingerprint (AA:BB:… 32 bytes, from Play Console → App integrity → App signing)`);
  return out;
}

/** apple-app-site-association: Universal Links for the app's paths (iOS 13+ components format). */
function appleAssociation(cfg) {
  return {
    applinks: {
      details: [
        {
          appIDs: [`${cfg.ios.teamId}.${cfg.ios.bundleId}`],
          components: cfg.ios.paths.map((p) => ({ "/": p, comment: "Paw Legends party invite" })),
        },
      ],
    },
  };
}

/** assetlinks.json (Android App Links), or null while no fingerprint is known (the file is then not published). */
function androidAssociation(cfg) {
  const prints = cfg.android.sha256;
  if (!prints.length) return null;
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: cfg.android.package, sha256_cert_fingerprints: prints },
    },
  ];
}

/** The files to publish under public/, path → exact text (null: the file must not exist). */
function outputs(cfg) {
  const apple = JSON.stringify(appleAssociation(cfg), null, 2) + "\n";
  const android = androidAssociation(cfg);
  return {
    ".well-known/apple-app-site-association": apple,
    "apple-app-site-association": apple,
    ".well-known/assetlinks.json": android ? JSON.stringify(android, null, 2) + "\n" : null,
  };
}

module.exports = { SHA256, problems, appleAssociation, androidAssociation, outputs };
