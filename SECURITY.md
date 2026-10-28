# Security Policy

## Reporting a vulnerability

Please don't open a public issue for security problems. Report them privately through
[GitHub's private vulnerability reporting](https://github.com/Zaytsman/SimpRightKit/security/advisories/new)
(the **Security** tab → **Report a vulnerability**).

Include what you found, where (package, file or workflow), and how to reproduce it. You'll get a reply as soon as possible.

## Scope

The kit's packages run in test projects and their CI, and the portal publishes test reports. Relevant reports include:

- code that could leak credentials or tokens, in a project, its CI logs or a published portal
- a published page that runs content it shouldn't (the pages render scenario, bug and report data)
- GitHub Actions workflows in this repository that could expose secrets or run untrusted code
- a release that doesn't match this repository's code (the packages are published from GitHub Actions with provenance)
- vulnerable dependencies that affect the packages

## Supported versions

Fixes go into the latest release.
