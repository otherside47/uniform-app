import { SHARED } from './dict.shared.js';
import { ADMIN } from './dict.admin.js';
import { APPS } from './dict.apps.js';

export const DICT = { ...SHARED, ...ADMIN, ...APPS };
