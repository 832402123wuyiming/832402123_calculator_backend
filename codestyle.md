# Back-End Code Standards

**Source:** [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html). The following project conventions adapt that guide for Node.js ES modules.

- Use two-space indentation, single-quoted ordinary strings, and semicolons.
- Use `const` by default; use `let` only for reassigned bindings. Avoid `var`.
- Use ES module imports and exports; keep files focused on one responsibility.
- Name functions and variables in `lowerCamelCase`, classes in `UpperCamelCase`, and environment variables in `UPPER_SNAKE_CASE`.
- Use explicit error classes and messages. Do not silently discard server errors.
- Explain grammar rules, rounding, and non-obvious bounds with concise comments.

Project-specific rules:

- Never execute expressions as JavaScript. Tokenize and parse the allowed grammar.
- Keep HTTP handling, arithmetic, and SQL in separate modules.
- Bind all user-controlled SQL values through prepared statements.
- Validate request bodies, expressions, identifiers, and pagination before use.
- Return one consistent JSON envelope with `success` and useful error information.
- Use UTC ISO timestamps and decimal result strings.
- Add regression coverage when changing parsing, persistence, or API behavior.
- Keep credentials, environment files, and generated databases out of version control.
