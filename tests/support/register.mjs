// Loaded with `node --import ./tests/support/register.mjs`: maps native Expo/React Native modules of the code under test to
// in-process fakes (node:sqlite stands in for expo-sqlite) and resolves the `@/` alias and extensionless TS imports.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
