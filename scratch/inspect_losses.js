import fs from 'fs';

// Let's import the data and see which plans are in tolerableLoss, breakEven, and profitable
import { execSync } from 'child_process';

const code = `
const fs = require('fs');
const { evaluatedPlans } = require('./scratch/eval_export.js');
`;

