
import { Job, SchedulingResult, TimelineEvent, QueueState } from "@/types/scheduler";

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
  quantum: number
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
  let nextQuantumEndTimes = Array(numCPUs).fill(0);
  
  // Find the earliest arrival time to start processing
  const earliestArrival = Math.min(...jobs.map(job => job.arrivalTime));
  currentTime = earliestArrival;
  
  // Initialize quantum end times
  for (let i = 0; i < numCPUs; i++) {
    nextQuantumEndTimes[i] = currentTime + quantum;
  }

  // Main scheduling loop
  while (jobs.filter(job => job.remainingTime! > 0).length > 0 || runningJobs.some(job => job !== null)) {
    // Track which jobs are currently assigned to any CPU to prevent the same job running on multiple CPUs
    const assignedJobIds = runningJobs
      .filter(job => job !== null)
      .map(job => job!.id);

    // Add newly arrived jobs to the ready queue
    const readyQueue = jobs.filter(
      job => job.arrivalTime <= currentTime && 
             job.remainingTime! > 0 && 
             !assignedJobIds.includes(job.id) // Exclude jobs already running on any CPU
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
    
    // Check each CPU for quantum end or job completion
    for (let i = 0; i < numCPUs; i++) {
      if (currentTime >= nextQuantumEndTimes[i]) {
        // If quantum ended, preempt the job if it's still running
        if (runningJobs[i] !== null) {
          const job = jobs.find(j => j.id === runningJobs[i]!.id);
          if (job && job.remainingTime! > 0) {
            // Job was preempted - it will go back to ready queue
            runningJobs[i] = null;
          }
        }
      }
    }
    
    // Track which CPUs had which jobs (to maintain continuity when possible)
    const lastJobByCP: Record<number, string | null> = {};
    for (let i = 0; i < numCPUs; i++) {
      lastJobByCP[i] = runningJobs[i] ? runningJobs[i]!.id : null;
    }
    
    // Assign jobs to available CPUs
    for (let i = 0; i < numCPUs; i++) {
      const isCPUAvailable = runningJobs[i] === null;

      if (isCPUAvailable && readyQueue.length > 0) {
        // Check if any jobs in the ready queue were last on this CPU
        const continuityJobIndex = readyQueue.findIndex(job => job.id === lastJobByCP[i]);
        // If a job was previously on this CPU and is in the ready queue, prioritize it
        let nextJobIndex = continuityJobIndex !== -1 ? continuityJobIndex : 0;
        
        // Find the first job not already running on another CPU
        while (
          nextJobIndex < readyQueue.length && 
          assignedJobIds.includes(readyQueue[nextJobIndex].id)
        ) {
          nextJobIndex++;
        }

        // If we found an available job, schedule it
        if (nextJobIndex < readyQueue.length) {
          const nextJob = readyQueue.splice(nextJobIndex, 1)[0];
          
          // If this is the first time this job is running, set its start time
          if (nextJob.startTime === undefined) {
            nextJob.startTime = currentTime;
          }
          
          // Set next quantum end time for this CPU
          nextQuantumEndTimes[i] = currentTime + quantum;
          
          // Calculate when job will end - either at completion or at quantum end
          const jobCompletionTime = currentTime + nextJob.remainingTime!;
          const processingEndTime = Math.min(jobCompletionTime, nextQuantumEndTimes[i]);
          
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
        } else if (readyQueue.length === 0) {
          // If no unassigned jobs are available, CPU is idle until next event
          const nextJobArrival = Math.min(
            ...jobs
              .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
              .map(job => job.arrivalTime),
            Infinity
          );
          
          const nextCPUEvent = Math.min(
            ...jobEndTimes.filter(time => time > currentTime),
            Infinity
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
      } else if (runningJobs[i] === null) {
        // CPU is idle, schedule next event
        const nextJobArrival = Math.min(
          ...jobs
            .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
            .map(job => job.arrivalTime),
          Infinity
        );
        
        const nextCPUEvent = Math.min(
          ...jobEndTimes.filter(time => time > currentTime),
          Infinity
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
          
          // Mark CPU as available immediately when job completes
          runningJobs[i] = null;
          nextQuantumEndTimes[i] = nextCompletionTime;
        }
        // If job reaches quantum end but isn't complete, it will be preempted
        else if (nextCompletionTime >= nextQuantumEndTimes[i]) {
          runningJobs[i] = null;
        }
      }
    }
    
    // Move time forward
    currentTime = nextCompletionTime;
  }
  
  // Sort completed jobs by name for consistent display
  completedJobs.sort((a, b) => a.name.localeCompare(b.name));
  
  // Add debug information to understand timeline data
  console.log("SRTN Timeline data:", { 
    timelineLength: timeline.length,
    maxTime: Math.max(...timeline.map(event => event.endTime))
  });
  
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
  quantum: number
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
  
  // Find the earliest arrival time to start processing
  const earliestArrival = Math.min(...jobs.map(job => job.arrivalTime));
  let currentTime = earliestArrival;
  
  // Keep track of running jobs and their end times
  let runningJobs = Array(numCPUs).fill(null);
  let jobEndTimes = Array(numCPUs).fill(0);
  
  // A circular queue to maintain the round robin order - will contain job objects with their current state
  let readyQueue: {id: string, name: string, remainingTime: number}[] = [];
  
  // Track which CPU last executed each job (for continuity)
  const lastCPUForJob: Record<string, number> = {};

  // Track all currently running job IDs to prevent double-scheduling
  let runningJobIds = new Set<string>();
  
  // Main scheduling loop
  while (jobs.filter(job => job.remainingTime! > 0).length > 0 || readyQueue.length > 0 || runningJobs.some(job => job !== null)) {
    // Step 1: Check for job completions and quantum expirations
    const completedJobsThisCycle: {id: string, cpuId: number}[] = [];
    const expiredQuantumsThisCycle: {job: any, cpuId: number}[] = [];
    
    // Clear the set of running job IDs
    runningJobIds.clear();
    
    // Check each CPU
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] !== null && currentTime >= jobEndTimes[i]) {
        const runningJob = runningJobs[i]!;
        const fullJob = jobs.find(j => j.id === runningJob.id)!;
        
        // Record job completion or quantum expiration
        if (fullJob.remainingTime! <= 0) {
          completedJobsThisCycle.push({id: runningJob.id, cpuId: i});
        } else {
          expiredQuantumsThisCycle.push({job: {...runningJob}, cpuId: i});
        }
        
        // Clear the CPU
        runningJobs[i] = null;
      }
      
      // Add any still-running job IDs to the set
      if (runningJobs[i] !== null) {
        runningJobIds.add(runningJobs[i]!.id);
      }
    }
    
    // Step 2: Add newly arrived jobs to the ready queue
    const newArrivals = jobs.filter(
      job => job.arrivalTime <= currentTime && 
             job.remainingTime! > 0 && 
             !readyQueue.some(queuedJob => queuedJob.id === job.id) &&
             !runningJobIds.has(job.id)
    );
    
    // Add new arrivals to queue
    readyQueue = [
      ...readyQueue,
      ...newArrivals.map(job => ({
        id: job.id,
        name: job.name,
        remainingTime: job.remainingTime!
      }))
    ];
    
    // Step 3: Add back expired jobs (that reached quantum limit) to end of queue
    // Properly follow Round Robin rule: remove current jobs from queue, then add them back at the end
    for (const {job, cpuId} of expiredQuantumsThisCycle) {
      readyQueue.push({
        id: job.id,
        name: job.name,
        remainingTime: jobs.find(j => j.id === job.id)!.remainingTime!
      });
    }
    
    // Step 4: Record the current queue state (after all queue changes)
    queueStates.push({
      time: currentTime,
      jobs: [...readyQueue] // Create a copy of the queue state
    });
    
    // Step 5: Assign jobs to available CPUs
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] === null && readyQueue.length > 0) {
        // Find the next job that is not already running on another CPU
        let jobIndex = 0;
        let continuityIndex = -1;
        
        // First, check for job continuity with this CPU
        for (let j = 0; j < readyQueue.length; j++) {
          if (lastCPUForJob[readyQueue[j].id] === i && !runningJobIds.has(readyQueue[j].id)) {
            continuityIndex = j;
            break;
          }
        }
        
        // Use continuity job if found, otherwise use first job
        if (continuityIndex !== -1) {
          jobIndex = continuityIndex;
        } else {
          // Just find the first job that isn't running elsewhere
          while (jobIndex < readyQueue.length && runningJobIds.has(readyQueue[jobIndex].id)) {
            jobIndex++;
          }
        }
        
        // If we have a valid job to assign
        if (jobIndex < readyQueue.length) {
          const nextQueueJob = readyQueue[jobIndex];
          const nextJob = jobs.find(j => j.id === nextQueueJob.id)!;
          
          // Remove job from queue
          readyQueue.splice(jobIndex, 1);
          
          // If this is the first time this job is running, set its start time
          if (nextJob.startTime === undefined) {
            nextJob.startTime = currentTime;
          }
          
          // Calculate time this job will run in this quantum
          const timeToRun = Math.min(nextJob.remainingTime!, quantum);
          const nextEndTime = currentTime + timeToRun;
          
          // Update job info
          runningJobs[i] = { 
            id: nextJob.id, 
            name: nextJob.name, 
            remainingTime: nextJob.remainingTime!
          };
          jobEndTimes[i] = nextEndTime;
          lastCPUForJob[nextJob.id] = i;
          runningJobIds.add(nextJob.id);
          
          // Add to timeline
          timeline.push({
            cpuId: i,
            jobId: nextJob.id,
            jobName: nextJob.name,
            startTime: currentTime,
            endTime: nextEndTime,
            isIdle: false
          });
        }
      }
    }
    
    // Step 6: Handle CPUs that are still idle after assignment attempts
    // Calculate the next event time
    const nextJobArrival = Math.min(
      ...jobs
        .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
        .map(job => job.arrivalTime),
      Infinity
    );
    
    const nextJobEnd = Math.min(
      ...jobEndTimes.filter((time, idx) => runningJobs[idx] !== null && time > currentTime),
      Infinity
    );
    
    // Determine the next event time
    let nextEventTime = Infinity;
    if (isFinite(nextJobArrival)) nextEventTime = nextJobArrival;
    if (isFinite(nextJobEnd) && nextJobEnd < nextEventTime) nextEventTime = nextJobEnd;
    
    // Make sure we have a valid next time (avoid infinite loops)
    if (!isFinite(nextEventTime) || nextEventTime <= currentTime) {
      console.error("Invalid next event time:", nextEventTime);
      break;
    }
    
    // Add idle time for CPUs with no job
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] === null) {
        timeline.push({
          cpuId: i,
          jobId: null,
          jobName: null,
          startTime: currentTime,
          endTime: nextEventTime,
          isIdle: true
        });
        jobEndTimes[i] = nextEventTime;
      }
    }
    
    // Step 7: Update job remaining times and check for completions
    for (let i = 0; i < numCPUs; i++) {
      const runningJob = runningJobs[i];
      if (runningJob !== null) {
        const job = jobs.find(j => j.id === runningJob.id)!;
        const timeProcessed = nextEventTime - currentTime;
        job.remainingTime! -= timeProcessed;
        
        // Check if job completed
        if (job.remainingTime! <= 0) {
          job.endTime = nextEventTime;
          job.turnaroundTime = job.endTime - job.arrivalTime;
          job.waitingTime = job.turnaroundTime - job.burstTime;
          
          completedJobs.push({ ...job });
        }
      }
    }
    
    // Move time forward
    currentTime = nextEventTime;
  }
  
  // Sort completed jobs by name for consistent display
  completedJobs.sort((a, b) => a.name.localeCompare(b.name));
  
  // Ensure we have a valid maxTime
  const maxTime = Math.max(...timeline.map(event => Number.isFinite(event.endTime) ? event.endTime : 0));
  
  console.log("Round Robin Timeline data:", { 
    timelineLength: timeline.length,
    maxTime,
    events: timeline.slice(0, 5) // Log first few events to check structure
  });
  
  return {
    completedJobs,
    timeline,
    queueStates,
    maxTime,
    jobColors: assignJobColors(inputJobs)
  };
};
