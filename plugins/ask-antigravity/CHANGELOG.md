# Changelog

## 1.1.0

- Invoke `agy` directly: the non-TTY `-p` hang was fixed upstream in agy 1.0.7, so the python3 PTY bridge is gone and **python3 is no longer a prerequisite**
- Require agy >= 1.0.7: setup and every invocation path now check the version and ask for an upgrade instead of hanging on older agy
- Reinstate per-call model selection: `--model "<display name>"` (from `agy models`) is forwarded to agy's print mode on review, adversarial-review, and rescue/task
- Add end-to-end companion tests against a fake `agy` binary, and an `AGY_LIVE=1` smoke suite for validating real agy after upgrades

## 1.0.0

- Initial release: `/ask-antigravity:setup`, `/ask-antigravity:review`, `/ask-antigravity:adversarial-review`, `/ask-antigravity:rescue`
