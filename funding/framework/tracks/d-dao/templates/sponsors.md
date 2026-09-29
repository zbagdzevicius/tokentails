# Sponsor log — {{PROGRAM}}

One row per ask. Record the person's **role** (e.g. "Noun owner", "delegate", "Nouncil member"),
never an email address or phone number — `fund check` fails if it finds one.
Append rows with `node bin/fund.mjs d:log {{SLUG}} --who "role" --channel X --ask Y --response Z`.
A row counts as a sponsor when Response contains "yes" or "sponsor" (e.g. "yes", "will sponsor")
and no hedge or redirect ("no", "not", "declined", "pending", "maybe", "if", "another", "try").

| Date | Who (role, not personal contact) | Channel | Ask | Response |
|---|---|---|---|---|
