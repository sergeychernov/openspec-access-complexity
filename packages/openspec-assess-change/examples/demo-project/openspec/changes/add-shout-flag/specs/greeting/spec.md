# Spec Delta

## ADDED Requirements

### Requirement: Shout option
The greeting function SHALL accept an optional `shout` option that returns the greeting in upper case, and SHALL keep the default output unchanged.

#### Scenario: Default greeting
- **WHEN** `greet("Ada")` is called without options
- **THEN** the result is `Hello, Ada!`

#### Scenario: Shouted greeting
- **WHEN** `greet("Ada", { shout: true })` is called
- **THEN** the result is `HELLO, ADA!`
