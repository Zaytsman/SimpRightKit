// A project's GitHub Actions setup as the kit reads it: the workflows, the local composite actions their steps use,
// and the callers of the reusable test workflow, one per test run (simpright.yml runs). `simpright doctor` checks
// them against simpright.yml; the portal links a run's workflow.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

export const WORKFLOWS_DIR = '.github/workflows';
/** The local composite actions the workflows' steps use: <name>/action.yml. */
export const ACTIONS_DIR = '.github/actions';
/** The reusable workflow that runs the tests and publishes the report; every run has one caller of it. */
export const TEST_WORKFLOW = `${WORKFLOWS_DIR}/playwright-run.yml`;

/** The parts of a GitHub Actions workflow the kit reads. */
export interface Workflow {
  on?: {
    schedule?: { cron: string }[];
    workflow_dispatch?: { inputs?: Record<string, WorkflowInput> } | null;
    workflow_call?: { inputs?: Record<string, WorkflowInput>; secrets?: Record<string, unknown> } | null;
  };
  jobs?: Record<string, WorkflowJob>;
}

export interface WorkflowInput {
  type?: string;
  default?: unknown;
  options?: string[];
}

export interface WorkflowJob {
  uses?: string;
  with?: Record<string, unknown>;
  secrets?: unknown;
  steps?: Step[];
}

/** A step of a workflow job or of a composite action. */
export interface Step {
  uses?: string;
  with?: Record<string, unknown>;
}

/** A local composite action: its file (action.yml or action.yaml) and the parts of it the kit reads. */
export interface LocalAction {
  file: string;
  action: {
    inputs?: Record<string, { required?: boolean; default?: unknown }>;
    runs?: { using?: string; steps?: Step[] };
  };
}

/** A job that calls the test workflow; the run it publishes is its family. */
export interface Caller {
  file: string;
  name: string;
  workflow: Workflow;
  job: WorkflowJob;
  family: unknown;
}

type OnError = (file: string, error: Error) => void;
const rethrow: OnError = (file, error) => {
  throw new Error(`${file}: ${error.message}`);
};

const readYaml = (root: string, file: string): unknown => parse(readFileSync(path.join(root, file), 'utf8')) ?? {};

/** The workflows in .github/workflows/, by file; a file that isn't valid YAML goes to `onError` and is left out. */
export function readWorkflows(root: string, onError: OnError = rethrow): Map<string, Workflow> {
  const workflows = new Map<string, Workflow>();
  if (!existsSync(path.join(root, WORKFLOWS_DIR))) return workflows;
  for (const name of readdirSync(path.join(root, WORKFLOWS_DIR)).filter((file) => /\.ya?ml$/.test(file)).sort()) {
    const file = `${WORKFLOWS_DIR}/${name}`;
    try {
      workflows.set(file, readYaml(root, file) as Workflow);
    } catch (error) {
      onError(file, error as Error);
    }
  }
  return workflows;
}

/**
 * The local actions, by the reference a step uses (`./.github/actions/<name>`). A folder without an action.yml or
 * action.yaml (a scripts folder such as lib/) isn't one; a file that isn't valid YAML goes to `onError` and is left out.
 */
export function readActions(root: string, onError: OnError = rethrow): Map<string, LocalAction> {
  const actions = new Map<string, LocalAction>();
  if (!existsSync(path.join(root, ACTIONS_DIR))) return actions;
  const folders = readdirSync(path.join(root, ACTIONS_DIR), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const folder of folders) {
    const file = ['action.yml', 'action.yaml']
      .map((name) => `${ACTIONS_DIR}/${folder}/${name}`)
      .find((candidate) => existsSync(path.join(root, candidate)));
    if (!file) continue;
    try {
      actions.set(`./${ACTIONS_DIR}/${folder}`, { file, action: readYaml(root, file) as LocalAction['action'] });
    } catch (error) {
      onError(file, error as Error);
    }
  }
  return actions;
}

/** The jobs that call the test workflow, in file order. */
export function callersOf(workflows: Map<string, Workflow>): Caller[] {
  return [...workflows].flatMap(([file, workflow]) =>
    Object.entries(workflow.jobs ?? {})
      .filter(([, job]) => job.uses === `./${TEST_WORKFLOW}`)
      .map(([name, job]) => ({ file, name, workflow, job, family: job.with?.family }))
  );
}

/** Run ID → the file name of the workflow that runs it (`simpright doctor` checks there is exactly one). */
export function runWorkflows(root: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const { file, family } of callersOf(readWorkflows(root))) {
    if (typeof family === 'string' && !files.has(family)) files.set(family, path.basename(file));
  }
  return files;
}
