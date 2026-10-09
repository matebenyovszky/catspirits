# Security

The latest version on `main` is supported. This is a static browser game; camera processing runs on the player's device. No server API, authentication service or game database is deployed.

Report vulnerabilities privately using [GitHub's Report a vulnerability](https://github.com/matebenyovszky/catspirits/security/advisories/new). Please include the affected commit, browser, reproduction steps and impact. Do not put access tokens, camera images or personal information in public issues. A response time is not guaranteed.

Use a local checkout for intrusive tests. Do not stress-test the production site, attack shared Cloudflare infrastructure or collect other players' data. The project does not offer a bug bounty.

Dependency scanning and tests reduce risk; they do not establish that the application is vulnerability-free. See [the security review](docs/security-review.md) for tested boundaries and remaining limitations.
