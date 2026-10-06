const { randomUUID } = require("crypto");

// In-memory job registry. Jobs are lost on restart, which is fine for a
// single-process app; use a queue (e.g. BullMQ) if you ever run several.
const jobs = new Map();
const MAX_FINISHED_JOBS = 50;

function createJob(type) {
  const job = {
    id: randomUUID(),
    type,
    status: "running",
    progress: { done: 0, total: 0 },
    result: null,
    error: null,
    startedAt: new Date(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  pruneFinished();
  return job;
}

function getJob(id) {
  return jobs.get(id);
}

function findRunning(type) {
  return [...jobs.values()].find((job) => job.type === type && job.status === "running");
}

// Runs `work(job)` in the background and records its outcome on the job
function runJob(job, work, logger) {
  work(job)
    .then((result) => {
      job.status = "completed";
      job.result = result;
    })
    .catch((error) => {
      job.status = "failed";
      job.error = error.message;
      logger.error({ err: error, jobId: job.id }, `${job.type} job failed`);
    })
    .finally(() => {
      job.finishedAt = new Date();
    });
}

function pruneFinished() {
  const finished = [...jobs.values()].filter((job) => job.status !== "running");
  for (const job of finished.slice(0, Math.max(0, finished.length - MAX_FINISHED_JOBS))) {
    jobs.delete(job.id);
  }
}

module.exports = {
  createJob,
  getJob,
  findRunning,
  runJob,
};
