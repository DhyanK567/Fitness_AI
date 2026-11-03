# Wellness Studio ERP app

`wellness_studio` is the custom Frappe application for ERP-owned Fitness business facts. It provides the tenant-scoped DocTypes and atomic methods used by the NestJS gateway. ERPNext core is not modified.

Install the app through the normal Frappe bench or Frappe Cloud custom-app process. Configure `fitness_api_callback_url` with an HTTPS gateway callback and `fitness_api_callback_secret` through site configuration; both are required for scheduler callbacks, and neither may be committed. Assign the dedicated gateway API user only the `WS API Integration` role (plus Frappe's automatic `All`, `Guest`, and `System User` roles); do not use Administrator credentials or grant business/administrator roles. The integration role has no Desk access and is denied generic DocType REST access; business methods require tenant-bound whitelisted APIs, and health/version probes are read-only.

The wheel was built and its packaged contents were inspected locally with `python -m pip wheel --no-deps --no-build-isolation`. The current SL/ERPE CI workflow checks Python compilation and contract tests but does not build the wheel. Runtime validation against an actual bench still requires a provisioned Frappe site.
