
import { Job, SchedulingResult, SchedulingMethod, TimelineEvent, QueueState } from "@/types/scheduler";

// Define colors for jobs
const jobColors = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#f97316", // orange
  "#84cc16", // lime
];

// Helper to assign colors to jobs
const assignJobColors = (jobs: Job[]): Record<string, string> => {
  const colorMap: Record<string, string> = {};
  jobs.forEach((job, index) => {
    colorMap[job.id] = jobColors[index % jobColors.length];
  });
  return colorMap;
};

export const scheduleSRTN = (
  inputJobs: Job[],
  numCPUs: number,
  quantum: number,
  schedulingMethod: SchedulingMethod
): SchedulingResult => {
  // Create a deep copy of input jobs to avoid modifying the original
  const jobs = inputJobs.map(job => ({
    ...job,
    remainingTime: job.burstTime,
    startTime: undefined,
    endTime: undefined
  }));

  const completedJobs: Job[] = [];
  const timeline: TimelineEvent[] = [];
  const queueStates: QueueState[] = [];
  
  let currentTime = 0;
  let runningJobs = Array(numCPUs).fill(null);
  let jobEndTimes = Array(numCPUs).fill(0);
  
  // Find the earliest arrival time to start processing
  const earliestArrival = Math.min(...jobs.map(job => job.arrivalTime));
  currentTime = earliestArrival;
  
  // Main scheduling loop
  while (jobs.filter(job => job.remainingTime! > 0).length > 0 || runningJobs.some(job => job !== null)) {
    // Add newly arrived jobs to the ready queue
    const readyQueue = jobs.filter(
      job => job.arrivalTime <= currentTime && job.remainingTime! > 0
    );
    
    // Sort ready queue by remaining time (shortest first)
    readyQueue.sort((a, b) => a.remainingTime! - b.remainingTime!);
    
    // Update queue state
    queueStates.push({
      time: currentTime,
      jobs: readyQueue.map(job => ({
        id: job.id,
        name: job.name,
        remainingTime: job.remainingTime!
      }))
    });
    
    // Assign jobs to available CPUs
    for (let i = 0; i < numCPUs; i++) {
      if (jobEndTimes[i] <= currentTime && readyQueue.length > 0) {
        const nextJob = readyQueue.shift();
        if (!nextJob) continue;
        
        // If this is the first time this job is running, set its start time
        if (nextJob.startTime === undefined) {
          nextJob.startTime = currentTime;
        }
        
        const processingTime = Math.min(
          nextJob.remainingTime!, 
          schedulingMethod === "quantum" ? quantum : nextJob.remainingTime!
        );
        
        const endTime = currentTime + processingTime;
        jobEndTimes[i] = endTime;
        runningJobs[i] = { ...nextJob, endTimeForThisRun: endTime };
        
        timeline.push({
          cpuId: i,
          jobId: nextJob.id,
          jobName: nextJob.name,
          startTime: currentTime,
          endTime,
          isIdle: false
        });
      } else if (jobEndTimes[i] <= currentTime) {
        // CPU is idle
        const nextTimePoint = Math.min(
          ...jobs
            .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
            .map(job => job.arrivalTime),
          ...jobEndTimes.filter(time => time > currentTime)
        );
        
        if (isFinite(nextTimePoint) && nextTimePoint > currentTime) {
          timeline.push({
            cpuId: i,
            jobId: null,
            jobName: null,
            startTime: currentTime,
            endTime: nextTimePoint,
            isIdle: true
          });
          jobEndTimes[i] = nextTimePoint;
        }
      }
    }
    
    // Determine next event time (job completion or new arrival)
    const nextCompletionTime = Math.min(...jobEndTimes);
    
    // Update job remaining times based on work done until the next event
    for (let i = 0; i < numCPUs; i++) {
      const runningJob = runningJobs[i];
      if (runningJob !== null) {
        const job = jobs.find(j => j.id === runningJob.id)!;
        const timeProcessed = Math.min(nextCompletionTime - currentTime, job.remainingTime!);
        job.remainingTime! -= timeProcessed;
        
        // Check if job completed
        if (job.remainingTime! <= 0) {
          job.endTime = nextCompletionTime;
          job.turnaroundTime = job.endTime - job.arrivalTime;
          job.waitingTime = job.turnaroundTime - job.burstTime;
          
          completedJobs.push({ ...job });
          runningJobs[i] = null;
        }
      }
    }
    
    // Move time forward
    currentTime = nextCompletionTime;
  }
  
  // Sort completed jobs by name for consistent display
  completedJobs.sort((a, b) => a.name.localeCompare(b.name));
  
  return {
    completedJobs,
    timeline,
    queueStates,
    maxTime: Math.max(...timeline.map(event => event.endTime)),
    jobColors: assignJobColors(inputJobs)
  };
};

export const scheduleRoundRobin = (
  inputJobs: Job[],
  numCPUs: number,
  quantum: number,
  schedulingMethod: SchedulingMethod
): SchedulingResult => {
  // Create a deep copy of input jobs to avoid modifying the original
  const jobs = inputJobs.map(job => ({
    ...job,
    remainingTime: job.burstTime,
    startTime: undefined,
    endTime: undefined
  }));

  const completedJobs: Job[] = [];
  const timeline: TimelineEvent[] = [];
  const queueStates: QueueState[] = [];
  
  let currentTime = 0;
  let runningJobs = Array(numCPUs).fill(null);
  let jobEndTimes = Array(numCPUs).fill(0);
  let readyQueue: Job[] = [];
  
  // Find the earliest arrival time to start processing
  const earliestArrival = Math.min(...jobs.map(job => job.arrivalTime));
  currentTime = earliestArrival;
  
  // Main scheduling loop
  while (jobs.filter(job => job.remainingTime! > 0).length > 0 || runningJobs.some(job => job !== null) || readyQueue.length > 0) {
    // Add newly arrived jobs to the ready queue
    const newArrivals = jobs.filter(
      job => job.arrivalTime <= currentTime && job.remainingTime! > 0 && 
      !readyQueue.some(queuedJob => queuedJob.id === job.id) && 
      !runningJobs.some(runningJob => runningJob && runningJob.id === job.id)
    );
    
    readyQueue.push(...newArrivals);
    
    // Update queue state
    queueStates.push({
      time: currentTime,
      jobs: readyQueue.map(job => ({
        id: job.id,
        name: job.name,
        remainingTime: job.remainingTime!
      }))
    });
    
    // Assign jobs to available CPUs
    for (let i = 0; i < numCPUs; i++) {
      if (jobEndTimes[i] <= currentTime && readyQueue.length > 0) {
        const nextJob = readyQueue.shift()!;
        
        // If this is the first time this job is running, set its start time
        if (nextJob.startTime === undefined) {
          nextJob.startTime = currentTime;
        }
        
        const processingTime = Math.min(
          nextJob.remainingTime!, 
          schedulingMethod === "quantum" ? quantum : nextJob.remainingTime!
        );
        
        const endTime = currentTime + processingTime;
        jobEndTimes[i] = endTime;
        runningJobs[i] = { ...nextJob, endTimeForThisRun: endTime };
        
        timeline.push({
          cpuId: i,
          jobId: nextJob.id,
          jobName: nextJob.name,
          startTime: currentTime,
          endTime,
          isIdle: false
        });
      } else if (jobEndTimes[i] <= currentTime) {
        // CPU is idle - schedule next time point
        const nextPossibleTime = Math.min(
          ...jobs
            .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
            .map(job => job.arrivalTime),
          ...jobEndTimes.filter(time => time > currentTime)
        );
        
        if (isFinite(nextPossibleTime) && nextPossibleTime > currentTime) {
          timeline.push({
            cpuId: i,
            jobId: null,
            jobName: null,
            startTime: currentTime,
            endTime: nextPossibleTime,
            isIdle: true
          });
          jobEndTimes[i] = nextPossibleTime;
        }
      }
    }
    
    // Find next event time
    const nextEventTime = Math.min(...jobEndTimes.filter(time => time > currentTime));
    
    // Update job remaining times and requeue jobs that haven't finished
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] !== null && jobEndTimes[i] <= nextEventTime) {
        const runningJob = runningJobs[i]!;
        const job = jobs.find(j => j.id === runningJob.id)!;
        
        const timeProcessed = Math.min(jobEndTimes[i] - currentTime, job.remainingTime!);
        job.remainingTime! -= timeProcessed;
        
        // If job is finished
        if (job.remainingTime! <= 0) {
          job.endTime = jobEndTimes[i];
          job.turnaroundTime = job.endTime - job.arrivalTime;
          job.waitingTime = job.turnaroundTime - job.burstTime;
          completedJobs.push({ ...job });
        } else {
          // Put job back in the queue if it still has remaining time
          readyQueue.push({ ...job });
        }
        
        runningJobs[i] = null;
      }
    }
    
    // Move time forward
    currentTime = nextEventTime;
  }
  
  // Sort completed jobs by name for consistent display
  completedJobs.sort((a, b) => a.name.localeCompare(b.name));
  
  return {
    completedJobs,
    timeline,
    queueStates,
    maxTime: Math.max(...timeline.map(event => event.endTime)),
    jobColors: assignJobColors(inputJobs)
  };
};
