/**
 * The OTA public key: a copy of pawlegends-app/ota/public-key.pem (PKCS#1). The backend checks the signature of the
 * static policy.json with it (docs/plans/moba/FORCE-UPDATE.md §3.2); client-policy.spec.ts keeps the copy in step with
 * the committed file. Public by design: it can only verify.
 */
export const PAWLEGENDS_OTA_PUBLIC_KEY_PEM = `-----BEGIN RSA PUBLIC KEY-----
MIIBCgKCAQEAt55aplyCueozWtV1kKL31+S+1IRUO81rTff+k+ryKgU1LCyTMxAP
9kMlfAQLTCWdFDcaJ7+A1b7cGFWlSIKNTBVgLdXeSOTz+MkAFJJdhbwasmCTuEce
cPAvihFmgfQv2JcLTFU30WuaytZNQRWdWq1cpFAYj+/rhwcipYWL5W5eZRmPN7kS
56MUSzttJWjgLgfpP+mQjIuqnfZPIVFytzudqyQxSE7FRc3QOrPBMFuyGdy7PY+r
yiesSwrSlG/pIAPCeo55U3+Ske4hcYMHKwjAbYVyEkvGrfV5sBMaOwLUIr5Ss9Gn
GxczQp+ZXAmGx2IJo8tHGXejo4eN5EZIrQIDAQAB
-----END RSA PUBLIC KEY-----
`;
