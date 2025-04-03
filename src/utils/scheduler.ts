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
  let nextQuantumStartTimes = Array(numCPUs).fill(0);
  
  // Find the earliest arrival time to start processing
  const earliestArrival = Math.min(...jobs.map(job => job.arrivalTime));
  currentTime = earliestArrival;
  
  // Initialize quantum start times
  for (let i = 0; i < numCPUs; i++) {
    nextQuantumStartTimes[i] = currentTime;
  }

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
    
    // For quantum-based scheduling, check if we need to reassign jobs
    if (schedulingMethod === "quantum") {
      for (let i = 0; i < numCPUs; i++) {
        if (currentTime >= nextQuantumStartTimes[i]) {
          // Mark current job as completed for this quantum
          if (runningJobs[i] !== null) {
            const job = jobs.find(j => j.id === runningJobs[i]!.id);
            if (job && job.remainingTime! > 0) {
              // If job is not completed but quantum is over, update job end time
              const lastEvent = timeline.find(event => 
                event.cpuId === i && event.jobId === job.id && event.endTime === currentTime
              );
              
              if (lastEvent) {
                // Job was running and quantum ended
                runningJobs[i] = null;
              }
            }
          }
          
          // Schedule next quantum start time
          nextQuantumStartTimes[i] = currentTime + quantum;
        }
      }
    }
    
    // Assign jobs to available CPUs
    for (let i = 0; i < numCPUs; i++) {
      const quantumEndTime = nextQuantumStartTimes[i];

      // CPU is available if:
      // 1. No job is running OR
      // 2. For quantum scheduling: current time is at quantum boundary
      const isCPUAvailable = runningJobs[i] === null || 
                            (schedulingMethod === "quantum" && currentTime >= quantumEndTime);

      if (isCPUAvailable && readyQueue.length > 0) {
        // Get job with shortest remaining time
        const nextJob = readyQueue.shift();
        if (!nextJob) continue;
        
        // If this is the first time this job is running, set its start time
        if (nextJob.startTime === undefined) {
          nextJob.startTime = currentTime;
        }
        
        let processingEndTime;
        if (schedulingMethod === "quantum") {
          // Processing ends either at end of job or end of quantum, whichever comes first
          const jobEndTime = currentTime + nextJob.remainingTime!;
          processingEndTime = Math.min(jobEndTime, nextQuantumStartTimes[i]);
        } else {
          // For endTime scheduling, job runs until completion
          processingEndTime = currentTime + nextJob.remainingTime!;
        }
        
        jobEndTimes[i] = processingEndTime;
        runningJobs[i] = { ...nextJob, endTimeForThisRun: processingEndTime };
        
        timeline.push({
          cpuId: i,
          jobId: nextJob.id,
          jobName: nextJob.name,
          startTime: currentTime,
          endTime: processingEndTime,
          isIdle: false
        });
      } else if (runningJobs[i] === null) {
        // CPU is idle
        const nextJobArrival = Math.min(
          ...jobs
            .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
            .map(job => job.arrivalTime)
        );
        
        const nextCPUEvent = Math.min(
          ...jobEndTimes.filter(time => time > currentTime),
          schedulingMethod === "quantum" ? nextQuantumStartTimes[i] : Infinity
        );
        
        const nextTimePoint = Math.min(
          isFinite(nextJobArrival) ? nextJobArrival : Infinity,
          isFinite(nextCPUEvent) ? nextCPUEvent : Infinity
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
    
    // Determine next event time
    const nextCompletionTime = Math.min(...jobEndTimes.filter(time => time > currentTime));
    
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
          
          // If using endTime scheduling, free up the CPU
          if (schedulingMethod === "endTime") {
            runningJobs[i] = null;
          }
          // For quantum scheduling, job will be removed at quantum boundary
          // but show idle time for remaining quantum
          else if (schedulingMethod === "quantum" && nextCompletionTime < nextQuantumStartTimes[i]) {
            timeline.push({
              cpuId: i,
              jobId: null,
              jobName: null,
              startTime: nextCompletionTime,
              endTime: nextQuantumStartTimes[i],
              isIdle: true
            });
            jobEndTimes[i] = nextQuantumStartTimes[i];
            runningJobs[i] = null;
          }
        }
        // For quantum scheduling, if job hasn't completed but quantum is over
        else if (schedulingMethod === "quantum" && nextCompletionTime >= nextQuantumStartTimes[i]) {
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
  let nextQuantumStartTimes = Array(numCPUs).fill(0);
  
  // Find the earliest arrival time to start processing
  const earliestArrival = Math.min(...jobs.map(job => job.arrivalTime));
  currentTime = earliestArrival;
  
  // Initialize quantum start times
  for (let i = 0; i < numCPUs; i++) {
    nextQuantumStartTimes[i] = currentTime;
  }
  
  // Main scheduling loop
  while (jobs.filter(job => job.remainingTime! > 0).length > 0 || 
         runningJobs.some(job => job !== null) || 
         readyQueue.length > 0) {
    
    // 1. Add newly arrived jobs to the ready queue
    const newArrivals = jobs.filter(
      job => job.arrivalTime <= currentTime && 
             job.remainingTime! > 0 && 
             !readyQueue.some(queuedJob => queuedJob.id === job.id) && 
             !runningJobs.some(runningJob => runningJob && runningJob.id === job.id)
    );
    
    readyQueue.push(...newArrivals);
    
    // 2. For quantum-based scheduling, check if we need to reassign jobs at quantum boundaries
    if (schedulingMethod === "quantum") {
      for (let i = 0; i < numCPUs; i++) {
        if (currentTime >= nextQuantumStartTimes[i]) {
          // Mark current job as completed for this quantum
          if (runningJobs[i] !== null) {
            const job = jobs.find(j => j.id === runningJobs[i]!.id);
            if (job && job.remainingTime! > 0) {
              // Put job back in the queue if it still has remaining time
              readyQueue.push({ ...job });
            }
            // Clear the running job
            runningJobs[i] = null;
          }
          
          // Schedule next quantum start time
          nextQuantumStartTimes[i] = currentTime + quantum;
        }
      }
    }
    
    // 3. Update queue state
    queueStates.push({
      time: currentTime,
      jobs: readyQueue.map(job => ({
        id: job.id,
        name: job.name,
        remainingTime: job.remainingTime!
      }))
    });
    
    // 4. Assign jobs to available CPUs
    for (let i = 0; i < numCPUs; i++) {
      const isCPUAvailable = runningJobs[i] === null || 
                            (schedulingMethod === "quantum" && currentTime >= nextQuantumStartTimes[i]);
      
      if (isCPUAvailable && readyQueue.length > 0) {
        // Get next job from the front of the queue (FIFO)
        const nextJob = readyQueue.shift()!;
        
        // If this is the first time this job is running, set its start time
        if (nextJob.startTime === undefined) {
          nextJob.startTime = currentTime;
        }
        
        let processingEndTime;
        if (schedulingMethod === "quantum") {
          // Processing ends either at end of job or end of quantum, whichever comes first
          const jobEndTime = currentTime + nextJob.remainingTime!;
          processingEndTime = Math.min(jobEndTime, nextQuantumStartTimes[i]);
        } else {
          // For endTime scheduling, job runs until completion
          processingEndTime = currentTime + nextJob.remainingTime!;
        }
        
        jobEndTimes[i] = processingEndTime;
        runningJobs[i] = { ...nextJob, endTimeForThisRun: processingEndTime };
        
        timeline.push({
          cpuId: i,
          jobId: nextJob.id,
          jobName: nextJob.name,
          startTime: currentTime,
          endTime: processingEndTime,
          isIdle: false
        });
      } else if (runningJobs[i] === null) {
        // CPU is idle - schedule next time point
        const nextJobArrival = Math.min(
          ...jobs
            .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
            .map(job => job.arrivalTime),
          Infinity
        );
        
        const nextCPUEvent = Math.min(
          ...jobEndTimes.filter(time => time > currentTime),
          schedulingMethod === "quantum" ? nextQuantumStartTimes[i] : Infinity
        );
        
        const nextTimePoint = Math.min(
          isFinite(nextJobArrival) ? nextJobArrival : Infinity,
          isFinite(nextCPUEvent) ? nextCPUEvent : Infinity
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
    
    // 5. Determine next event time
    const nextEventTime = Math.min(
      ...jobEndTimes.filter(time => time > currentTime),
      ...nextQuantumStartTimes.filter(time => time > currentTime)
    );
    
    // 6. Update job remaining times and handle completed jobs
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] !== null) {
        const runningJob = runningJobs[i]!;
        const job = jobs.find(j => j.id === runningJob.id)!;
        
        const timeProcessed = Math.min(nextEventTime - currentTime, job.remainingTime!);
        job.remainingTime! -= timeProcessed;
        
        // If job is finished
        if (job.remainingTime! <= 0) {
          job.endTime = currentTime + timeProcessed;
          job.turnaroundTime = job.endTime - job.arrivalTime;
          job.waitingTime = job.turnaroundTime - job.burstTime;
          
          completedJobs.push({ ...job });
          
          // For endTime scheduling, free up CPU immediately
          if (schedulingMethod === "endTime") {
            runningJobs[i] = null;
          }
          // For quantum scheduling, show idle time for remaining quantum
          else if (schedulingMethod === "quantum" && job.endTime < nextQuantumStartTimes[i]) {
            timeline.push({
              cpuId: i,
              jobId: null,
              jobName: null,
              startTime: job.endTime,
              endTime: nextQuantumStartTimes[i],
              isIdle: true
            });
            jobEndTimes[i] = nextQuantumStartTimes[i];
            runningJobs[i] = null;
          }
        }
        // For endTime scheduling, if job finishes before next event
        else if (schedulingMethod === "endTime" && job.remainingTime! > 0 && 
                 currentTime + timeProcessed === nextEventTime) {
          // Keep job running
        }
        // For quantum scheduling, if quantum ends before job completion
        else if (schedulingMethod === "quantum" && 
                 nextEventTime === nextQuantumStartTimes[i]) {
          // Job will be put back in queue at the beginning of the loop
        }
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
