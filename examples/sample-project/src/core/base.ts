// A core file: it imports only core files, the seams and packages.
import path from 'node:path';
import type { Product } from '@core/types';
import { project } from '../config/project';
import { label } from './helpers';

export const describeProduct = (product: Product) => `${label(product.name)} (${project.name}, ${path.sep})`;
