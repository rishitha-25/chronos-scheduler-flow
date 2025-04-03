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
  
  // Queue to maintain the Round Robin order
  let readyQueue: {id: string, name: string, remainingTime: number}[] = [];
  
  // Keep track of running jobs and their end times
  let runningJobs = Array(numCPUs).fill(null);
  let jobEndTimes = Array(numCPUs).fill(currentTime);
  
  // Track which CPU last executed each job (for continuity)
  const lastCPUForJob: Record<string, number> = {};
  
  // Initialize the queue with jobs that arrive at the start time
  const initialJobs = jobs.filter(job => job.arrivalTime <= currentTime);
  readyQueue = initialJobs.map(job => ({
    id: job.id,
    name: job.name,
    remainingTime: job.remainingTime!
  }));
  
  // Record initial queue state
  if (readyQueue.length > 0) {
    queueStates.push({
      time: currentTime,
      jobs: [...readyQueue]
    });
  }
  
  // Main scheduling loop
  while (jobs.some(job => job.remainingTime! > 0)) {
    // Step 1: Process completed jobs and quantum expirations
    const completedJobsThisCycle: string[] = [];
    const expiredQuantumsThisCycle: {id: string, name: string, remainingTime: number, cpuId: number}[] = [];
    
    // Check each CPU for completion or quantum expiration
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] !== null && currentTime >= jobEndTimes[i]) {
        const runningJob = runningJobs[i]!;
        const fullJob = jobs.find(j => j.id === runningJob.id)!;
        
        if (fullJob.remainingTime! <= 0) {
          // Job completed
          completedJobsThisCycle.push(runningJob.id);
          fullJob.endTime = jobEndTimes[i];
          fullJob.turnaroundTime = fullJob.endTime - fullJob.arrivalTime;
          fullJob.waitingTime = fullJob.turnaroundTime - fullJob.burstTime;
          completedJobs.push({ ...fullJob });
        } else {
          // Quantum expired
          expiredQuantumsThisCycle.push({
            id: runningJob.id,
            name: runningJob.name,
            remainingTime: fullJob.remainingTime!,
            cpuId: i
          });
        }
        
        // Clear the CPU
        runningJobs[i] = null;
      }
    }
    
    // Step 2: Update the ready queue by removing completed jobs
    readyQueue = readyQueue.filter(job => !completedJobsThisCycle.includes(job.id));
    
    // Step 3: Find the next time point
    const nextTimePoint = getNextTimePoint(currentTime, jobs, jobEndTimes, runningJobs);
    
    if (!Number.isFinite(nextTimePoint) || nextTimePoint <= currentTime) {
      console.error("Invalid next event time:", nextTimePoint);
      // Emergency exit to prevent infinite loop
      break;
    }
    
    // Step 4: Add newly arrived jobs between current time and next time point
    const newArrivals = jobs.filter(job => 
      job.arrivalTime > currentTime && 
      job.arrivalTime <= nextTimePoint && 
      job.remainingTime! > 0 &&
      !completedJobsThisCycle.includes(job.id)
    );
    
    // Add new arrivals to the ready queue
    if (newArrivals.length > 0) {
      readyQueue = [
        ...readyQueue,
        ...newArrivals.map(job => ({
          id: job.id,
          name: job.name,
          remainingTime: job.remainingTime!
        }))
      ];
    }
    
    // Step 5: Add back jobs with expired quantums to the end of the queue
    for (const expiredJob of expiredQuantumsThisCycle) {
      readyQueue.push({
        id: expiredJob.id,
        name: expiredJob.name,
        remainingTime: expiredJob.remainingTime
      });
    }
    
    // Move time forward
    currentTime = nextTimePoint;
    
    // Record queue state at this time
    queueStates.push({
      time: currentTime,
      jobs: [...readyQueue]
    });
    
    // Step 6: Update job remaining times for running jobs
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] !== null && jobEndTimes[i] > currentTime) {
        const job = jobs.find(j => j.id === runningJobs[i]!.id)!;
        const timeProcessed = nextTimePoint - currentTime;
        job.remainingTime! -= timeProcessed;
        
        // Check if job completes before the next scheduling point
        if (job.remainingTime! <= 0) {
          job.remainingTime = 0;
        }
      }
    }
    
    // Step 7: Assign jobs to available CPUs
    const runningJobIds = new Set(
      runningJobs
        .filter(job => job !== null)
        .map(job => job!.id)
    );
    
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] === null && readyQueue.length > 0) {
        // Find the best job for this CPU
        let bestJobIndex = -1;
        
        // First preference: Continuity with the same CPU
        for (let j = 0; j < readyQueue.length; j++) {
          if (lastCPUForJob[readyQueue[j].id] === i && !runningJobIds.has(readyQueue[j].id)) {
            bestJobIndex = j;
            break;
          }
        }
        
        // If no continuity job found, take the first available job
        if (bestJobIndex === -1) {
          for (let j = 0; j < readyQueue.length; j++) {
            if (!runningJobIds.has(readyQueue[j].id)) {
              bestJobIndex = j;
              break;
            }
          }
        }
        
        if (bestJobIndex !== -1) {
          const nextJob = readyQueue[bestJobIndex];
          // Remove the job from the ready queue
          readyQueue.splice(bestJobIndex, 1);
          
          const job = jobs.find(j => j.id === nextJob.id)!;
          
          // If this is the first time this job is running, set its start time
          if (job.startTime === undefined) {
            job.startTime = currentTime;
          }
          
          // Calculate when this quantum will end
          const quantumEndTime = currentTime + Math.min(quantum, job.remainingTime!);
          
          // Update running job info
          runningJobs[i] = { 
            id: nextJob.id, 
            name: nextJob.name, 
            remainingTime: nextJob.remainingTime 
          };
          jobEndTimes[i] = quantumEndTime;
          lastCPUForJob[nextJob.id] = i;
          runningJobIds.add(nextJob.id);
          
          // Add to timeline
          timeline.push({
            cpuId: i,
            jobId: nextJob.id,
            jobName: nextJob.name,
            startTime: currentTime,
            endTime: quantumEndTime,
            isIdle: false
          });
          
          // Update the remaining time
          const timeToProcess = quantumEndTime - currentTime;
          job.remainingTime! -= timeToProcess;
          
          // Check if job will complete
          if (job.remainingTime! <= 0) {
            job.remainingTime = 0;
          }
        }
      }
    }
    
    // Step 8: Handle idle CPUs
    for (let i = 0; i < numCPUs; i++) {
      if (runningJobs[i] === null) {
        // Find the next earliest event
        const nextEvent = getNextTimePoint(currentTime, jobs, jobEndTimes, runningJobs);
        
        if (isFinite(nextEvent) && nextEvent > currentTime) {
          timeline.push({
            cpuId: i,
            jobId: null,
            jobName: null,
            startTime: currentTime,
            endTime: nextEvent,
            isIdle: true
          });
          jobEndTimes[i] = nextEvent;
        }
      }
    }
  }
  
  // Sort completed jobs by name for consistent display
  completedJobs.sort((a, b) => a.name.localeCompare(b.name));
  
  // Calculate maxTime
  const maxTime = Math.max(...timeline.map(event => event.endTime));
  
  console.log("Round Robin Timeline data:", { 
    timelineLength: timeline.length,
    maxTime: maxTime,
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

// Helper function to determine the next time point for scheduling decisions
function getNextTimePoint(
  currentTime: number, 
  jobs: Job[], 
  jobEndTimes: number[], 
  runningJobs: ({ id: string; name: string; remainingTime: number } | null)[]
): number {
  // Find the next job arrival after current time
  const nextJobArrival = Math.min(
    ...jobs
      .filter(job => job.arrivalTime > currentTime && job.remainingTime! > 0)
      .map(job => job.arrivalTime),
    Infinity
  );
  
  // Find the next job completion or quantum end
  const nextJobEnd = Math.min(
    ...jobEndTimes.filter((time, idx) => runningJobs[idx] !== null && time > currentTime),
    Infinity
  );
  
  // Return the earlier of the two events
  return Math.min(nextJobArrival, nextJobEnd);
}
