# Reviewed minimatch compatibility

Research pins minimatch 11.0.1 only for the four installed lint callers: ESLint 9.32.0, @eslint/config-array 0.21.0, @eslint/eslintrc 3.3.1 and @typescript-eslint/typescript-estree 8.71.2. These are local, reviewed compatibility resolutions outside the parents' published dependency ranges, not a claim that the upstream ranges support v11.

The fixed matcher changes its engine and removes APIs including `makeRe` and `matchOne`. Inspection found that these callers use the retained `Minimatch` constructor and `match` method, or the named `minimatch` function. They do not use the removed regex-generation methods. No general override applies to unrelated consumers.

`scripts/fixtures/minimatch-compat.json` records 156 cases per caller from the original installed matcher versions. The regression suite checks both retained APIs against those results, verifies source/ignore selection through the real ESLint configuration, and confirms that the TypeScript and React hook rules still report violations. It also runs hostile optimization-level-2 patterns in a subprocess with a heap cap and deadline. Caller-version guards require a new review when a parent changes.

The full repository's lint diagnostics are compared before and after the matcher upgrade during release validation. Existing lint findings are not suppressed, and `eslint.config.js`, the `lint` script, audit thresholds and required CI checks remain unchanged. The repository's pre-existing lint debt is not represented as a passing lint run.

The security audit continues to reject moderate, high and critical findings. No advisory allowlist, version masking, patched-vulnerable implementation or audit exclusion is used. Future dependency upgrades must retain these checks or replace the resolutions with an upstream-supported dependency path.
