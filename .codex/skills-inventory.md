# Installed project skills — Mobile

Updated: 2026-09-13

All skills in this file are copied project-local under `.agents/skills/`. The
generated `skills-lock.json` records the source paths and content hashes.

## Expo/React Native skills

- `react-native-patterns` — `affaan-m/ecc`.
- `react-native-design`, `react-native-architecture`,
  `react-state-management` — `wshobson/agents`.
- `vercel-react-native-skills` — `vercel-labs/agent-skills`; Expo/RN
  performance and platform guidance.
- `imagegen-frontend-mobile` — `Leonxlnx/taste-skill`; reference images only,
  not a runtime dependency.

## Cross-cutting review skills

- `ponytail`, `ponytail-review`, `ponytail-audit`, `ponytail-debt`,
  `ponytail-gain`, `ponytail-help` — `DietrichGebert/ponytail`.
- No global plugin or hook was installed. Use the narrowest skill for the task.

The requested `codex plugin add expo@openai-curated` was checked but the
marketplace returned `plugin expo was not found`; no replacement plugin was
installed.

## Stack boundary

This checkout is Expo/React Native. Do not infer Flutter, Dart or Kotlin Compose.
Unity gameplay and native Android bridge are part of the Fire3D target
architecture, but are not implemented in this checkout yet. They require an
Expo development/native build and a separately managed Unity project; Expo Go
or web preview cannot be used as evidence of the integration. Do not install a
skill/plugin merely to record this boundary.
